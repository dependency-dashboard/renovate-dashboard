import { Injectable } from '@angular/core';
import {
  CiStatus,
  DEFAULT_GITHUB_HOST,
  GitHubCheckRunsResponse,
  GitHubCombinedStatusResponse,
  GitHubIssueSearchItem,
  GitHubPullRequestDetails,
  GitHubRepository,
  GitHubSearchIssuesResponse,
  OrgConnection,
  PullRequest,
} from '../models/pull-request.model';
import { GitProvider, ProviderSearchResult } from './git-provider';

const DEFAULT_RENOVATE_AUTHOR = 'app/renovate';

/**
 * REST API root for a GitHub host: github.com uses the dedicated api
 * subdomain; GitHub Enterprise Server serves the identical API under
 * /api/v3 on the instance host.
 */
export function githubApiBase(host: string): string {
  return host === DEFAULT_GITHUB_HOST ? 'https://api.github.com' : `${host}/api/v3`;
}

/** GitProvider implementation for github.com and GitHub Enterprise Server (REST v3 API). */
@Injectable({ providedIn: 'root' })
export class GitHubProviderService implements GitProvider {
  async searchRenovatePrs(connection: OrgConnection): Promise<ProviderSearchResult> {
    const author = connection.renovateAuthor?.trim() || DEFAULT_RENOVATE_AUTHOR;
    const query = `is:pr author:${author} org:${connection.organization} is:open`;
    const { items, incompleteResults } = await this.fetchAllSearchItems(connection.host, query, connection.token);

    const prs: PullRequest[] = [];
    for (const item of items) {
      const repoUrlParts = item.repository_url.split('/');
      const repoName = repoUrlParts.pop();
      const repoOwner = repoUrlParts.pop();
      if (!repoOwner || !repoName) {
        continue;
      }

      prs.push({
        id: item.id,
        uid: `${connection.platform}|${connection.host}|${item.id}`,
        platform: connection.platform,
        host: connection.host,
        number: item.number,
        title: item.title,
        html_url: item.html_url,
        user: { login: item.user.login, avatar_url: item.user.avatar_url },
        created_at: item.created_at,
        labels: item.labels,
        repoOwner,
        repoName,
        head: { sha: '' }, // Filled in by fetchPrDetails
        isModified: false,
        ciStatus: 'unknown',
        checkRuns: [],
        isProcessing: false,
        workflowStatus: 'unknown',
        // The search is scoped with org:<organization>, so every result
        // belongs to this connection.
        orgToken: connection.token,
      });
    }

    return { prs, incompleteResults };
  }

  async fetchPrDetails(pr: PullRequest): Promise<void> {
    const apiBase = githubApiBase(pr.host);
    try {
      // Get full PR data (for commit count and head SHA)
      const prUrl = `${apiBase}/repos/${pr.repoOwner}/${pr.repoName}/pulls/${pr.number}`;
      const prData = await this.apiRequest<GitHubPullRequestDetails>(prUrl, pr.orgToken);
      pr.isModified = prData.commits > 1;
      pr.head.sha = prData.head.sha;
      pr.commits = prData.commits;

      // Get repository settings to determine allowed merge methods
      const repoUrl = `${apiBase}/repos/${pr.repoOwner}/${pr.repoName}`;
      const repoData = await this.apiRequest<GitHubRepository>(repoUrl, pr.orgToken);
      pr.allowSquashMerge = repoData.allow_squash_merge;
      pr.allowMergeCommit = repoData.allow_merge_commit;
      pr.allowRebaseMerge = repoData.allow_rebase_merge;

      // Get combined CI status for the PR's head commit (as a fallback)
      const statusUrl = `${apiBase}/repos/${pr.repoOwner}/${pr.repoName}/commits/${pr.head.sha}/status`;
      const statusData = await this.apiRequest<GitHubCombinedStatusResponse>(statusUrl, pr.orgToken);
      pr.ciStatus = this.mapCombinedStatus(statusData.state);

      // Get individual check runs for more detailed status
      const checksUrl = `${apiBase}/repos/${pr.repoOwner}/${pr.repoName}/commits/${pr.head.sha}/check-runs`;
      const checksData = await this.apiRequest<GitHubCheckRunsResponse>(checksUrl, pr.orgToken);
      if (checksData && checksData.check_runs) {
        pr.checkRuns = checksData.check_runs.map(cr => ({
          id: cr.id,
          name: cr.name,
          status: cr.status,
          conclusion: cr.conclusion,
          html_url: cr.html_url,
        }));

        // If check runs exist, use them as the source of truth for the overall PR status
        if (pr.checkRuns.length > 0) {
          const conclusions = pr.checkRuns.map(cr => cr.conclusion);
          const statuses = pr.checkRuns.map(cr => cr.status);

          if (conclusions.some(c => c === 'failure' || c === 'timed_out')) {
            pr.ciStatus = 'failure';
            pr.workflowStatus = 'failure';
          } else if (statuses.some(s => s === 'in_progress' || s === 'queued')) {
            pr.ciStatus = 'pending';
            pr.workflowStatus = 'pending';
          } else if (conclusions.every(c => c === 'success' || c === 'skipped' || c === 'neutral')) {
            pr.ciStatus = 'success';
            pr.workflowStatus = 'success';
          }
        } else {
          // Set workflow status same as CI status if no check runs
          pr.workflowStatus = pr.ciStatus;
        }
      }
    } catch (error: unknown) {
      console.error(`Failed to fetch details for PR #${pr.number}`, error);
      pr.ciStatus = 'unknown';
      pr.workflowStatus = 'unknown';
      pr.checkRuns = [];
    }
  }

  async approveAndMerge(pr: PullRequest): Promise<void> {
    const apiBase = githubApiBase(pr.host);
    // Step 1: Approve
    const reviewUrl = `${apiBase}/repos/${pr.repoOwner}/${pr.repoName}/pulls/${pr.number}/reviews`;
    await this.apiRequest<void>(reviewUrl, pr.orgToken, 'POST', { event: 'APPROVE' });

    // Step 2: Merge with a method appropriate for the PR and repo settings
    const mergeMethod = this.determineMergeMethod(pr);
    const mergeUrl = `${apiBase}/repos/${pr.repoOwner}/${pr.repoName}/pulls/${pr.number}/merge`;
    await this.apiRequest<void>(mergeUrl, pr.orgToken, 'PUT', { merge_method: mergeMethod });
  }

  async close(pr: PullRequest): Promise<void> {
    const url = `${githubApiBase(pr.host)}/repos/${pr.repoOwner}/${pr.repoName}/pulls/${pr.number}`;
    await this.apiRequest<void>(url, pr.orgToken, 'PATCH', { state: 'closed' });
  }

  // --- INTERNALS ---

  private async fetchAllSearchItems(host: string, query: string, token: string): Promise<{ items: GitHubIssueSearchItem[]; incompleteResults: boolean }> {
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `token ${token}`
    };
    const allItems: GitHubIssueSearchItem[] = [];
    let incompleteResults = false;

    for (let page = 1; page <= 10; page++) {
      const params = new URLSearchParams({ q: query, per_page: '100', page: String(page) });
      const url = `${githubApiBase(host)}/search/issues?${params.toString()}`;
      const response = await fetch(url, { headers });
      if (!response.ok) {
        let errorMessage = response.statusText
          ? `GitHub search failed: ${response.status} ${response.statusText}`
          : `GitHub search failed: ${response.status}`;
        try {
          const errorBody = await response.json() as { message?: string };
          if (errorBody.message) { errorMessage = errorBody.message; }
        } catch { /* non-JSON body */ }
        throw new Error(errorMessage);
      }
      const data = await response.json() as GitHubSearchIssuesResponse;
      allItems.push(...data.items);
      if (data.incomplete_results) {
        incompleteResults = true;
      }
      const reachedTotalCount = allItems.length >= data.total_count;
      const noMoreItems = data.items.length === 0;
      if (reachedTotalCount || noMoreItems) {
        break;
      }
      // Reached the 10-page (1000-result) cap with more results remaining
      if (page === 10) {
        incompleteResults = true;
      }
    }

    return { items: allItems, incompleteResults };
  }

  private async apiRequest<T>(url: string, token: string, method = 'GET', body?: object): Promise<T> {
    const headers: HeadersInit = {
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `token ${token}`
    };
    const options: RequestInit = { method, headers };
    if (body) {
      options.body = JSON.stringify(body);
    }
    const response = await fetch(url, options);
    if (!response.ok) {
      let errorMessage = response.statusText
        ? `API request failed with status: ${response.status} ${response.statusText}`
        : `API request failed with status: ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch {
        // Response body is not JSON (e.g. HTML error page from a gateway); use default message
      }
      throw new Error(errorMessage);
    }
    // For 204 No Content responses (like on merge)
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  private mapCombinedStatus(state: GitHubCombinedStatusResponse['state'] | null | undefined): CiStatus {
    switch (state) {
      case 'success':
        return 'success';
      case 'pending':
        return 'pending';
      case 'failure':
      case 'error':
        return 'failure';
      default:
        return 'unknown';
    }
  }

  private determineMergeMethod(pr: PullRequest): string {
    const commits = pr.commits ?? 0;

    // If only one commit and rebase is supported, use rebase
    if (commits === 1 && pr.allowRebaseMerge) {
      return 'rebase';
    }

    // If more than one commit and squash is supported, use squash
    if (commits > 1 && pr.allowSquashMerge) {
      return 'squash';
    }

    // Otherwise if merge is supported, use merge
    if (pr.allowMergeCommit) {
      return 'merge';
    }

    // If none of those work, throw an error
    throw new Error(`No suitable merge method available for PR #${pr.number}`);
  }
}
