import { Injectable } from '@angular/core';
import { CheckRun, CiStatus, OrgConnection, PullRequest } from '../models/pull-request.model';
import { ApiError, GitProvider, ProviderSearchResult } from './git-provider';

const DEFAULT_RENOVATE_AUTHOR = 'renovate-bot';

/** Shape of a merge request from the GitLab group merge_requests API. */
interface GitLabMergeRequest {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  web_url: string;
  created_at: string;
  sha?: string;
  author: { username: string; avatar_url: string | null };
  head_pipeline?: { id: number; status: string } | null;
}

interface GitLabPipelineJob {
  id: number;
  name: string;
  status: string;
  web_url: string;
}

/** GitProvider implementation for gitlab.com and self-hosted GitLab (REST v4 API). */
@Injectable({ providedIn: 'root' })
export class GitLabProviderService implements GitProvider {
  async searchRenovatePrs(connection: OrgConnection): Promise<ProviderSearchResult> {
    const author = connection.renovateAuthor?.trim() || DEFAULT_RENOVATE_AUTHOR;
    const groupPath = encodeURIComponent(connection.organization);
    const apiBase = `${connection.host}/api/v4`;

    const prs: PullRequest[] = [];
    let incompleteResults = false;

    // Plain page loop (a page shorter than per_page means we're done); the
    // 10-page cap mirrors the GitHub provider's bound on huge result sets.
    for (let page = 1; page <= 10; page++) {
      const params = new URLSearchParams({
        state: 'opened',
        author_username: author,
        include_subgroups: 'true',
        scope: 'all',
        per_page: '100',
        page: String(page),
      });
      const mrs = await this.apiRequest<GitLabMergeRequest[]>(
        `${apiBase}/groups/${groupPath}/merge_requests?${params.toString()}`,
        connection.token,
      );

      for (const mr of mrs) {
        prs.push(this.normalizeMr(mr, connection));
      }

      if (mrs.length < 100) {
        break;
      }
      if (page === 10) {
        incompleteResults = true; // capped with more results likely remaining
      }
    }

    return { prs, incompleteResults };
  }

  async fetchPrDetails(pr: PullRequest): Promise<void> {
    const mrBase = this.mrApiBase(pr);
    try {
      // MR detail: head SHA and the head pipeline drive the CI status.
      const mr = await this.apiRequest<GitLabMergeRequest>(mrBase, pr.orgToken);
      pr.head.sha = mr.sha ?? '';
      const pipeline = mr.head_pipeline;
      pr.ciStatus = this.mapPipelineStatus(pipeline?.status);
      pr.workflowStatus = pr.ciStatus;

      // Commit count (only "more than one?" matters): two entries suffice.
      const commits = await this.apiRequest<unknown[]>(`${mrBase}/commits?per_page=2`, pr.orgToken);
      pr.commits = commits.length;
      pr.isModified = commits.length > 1;

      // Pipeline jobs become the expandable "checks" list.
      if (pipeline) {
        const jobs = await this.apiRequest<GitLabPipelineJob[]>(
          `${pr.host}/api/v4/projects/${pr.projectId}/pipelines/${pipeline.id}/jobs?per_page=100`,
          pr.orgToken,
        );
        pr.checkRuns = jobs.map(job => this.mapJob(job));
      }
    } catch (error: unknown) {
      console.error(`Failed to fetch details for MR !${pr.number}`, error);
      pr.ciStatus = 'unknown';
      pr.workflowStatus = 'unknown';
      pr.checkRuns = [];
    }
  }

  async approveAndMerge(pr: PullRequest): Promise<void> {
    const mrBase = this.mrApiBase(pr);

    // MR approvals are a Premium feature — on Free tiers the endpoint is
    // absent/forbidden. Approval is best-effort; merging proceeds regardless.
    try {
      await this.apiRequest<void>(`${mrBase}/approve`, pr.orgToken, 'POST');
    } catch (error: unknown) {
      if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
        console.warn(`Approval unavailable for MR !${pr.number} (status ${error.status}); merging without it.`);
      } else {
        throw error;
      }
    }

    // The project's merge-method settings are enforced server-side; squash
    // multi-commit MRs to mirror the GitHub provider's behavior.
    await this.apiRequest<void>(`${mrBase}/merge`, pr.orgToken, 'PUT', {
      squash: (pr.commits ?? 1) > 1,
    });
  }

  async close(pr: PullRequest): Promise<void> {
    await this.apiRequest<void>(this.mrApiBase(pr), pr.orgToken, 'PUT', { state_event: 'close' });
  }

  // --- INTERNALS ---

  private normalizeMr(mr: GitLabMergeRequest, connection: OrgConnection): PullRequest {
    // The project's full path lives in the web URL: <host>/<path>/-/merge_requests/<iid>.
    // repoOwner is the connection's group (so the org filter matches); repoName
    // is the remainder of the path (including subgroups).
    let repoName = `project-${mr.project_id}`;
    const pathMatch = mr.web_url.match(/^https?:\/\/[^/]+\/(.+?)\/-\/merge_requests\//);
    if (pathMatch) {
      const segments = pathMatch[1].split('/');
      repoName = segments.slice(1).join('/') || segments[0];
    }

    return {
      id: mr.id,
      uid: `${connection.platform}|${connection.host}|${mr.id}`,
      platform: connection.platform,
      host: connection.host,
      projectId: mr.project_id,
      number: mr.iid,
      title: mr.title,
      html_url: mr.web_url,
      user: { login: mr.author.username, avatar_url: mr.author.avatar_url ?? '' },
      created_at: mr.created_at,
      labels: [], // GitLab labels are plain strings; the UI never renders them
      repoOwner: connection.organization,
      repoName,
      head: { sha: mr.sha ?? '' },
      isModified: false,
      ciStatus: 'unknown',
      checkRuns: [],
      isProcessing: false,
      workflowStatus: 'unknown',
      orgToken: connection.token,
    };
  }

  private mrApiBase(pr: PullRequest): string {
    return `${pr.host}/api/v4/projects/${pr.projectId}/merge_requests/${pr.number}`;
  }

  private mapPipelineStatus(status: string | undefined): CiStatus {
    switch (status) {
      case 'success':
      case 'skipped':
        return 'success';
      case 'failed':
      case 'canceled':
        return 'failure';
      case 'running':
      case 'pending':
      case 'created':
      case 'preparing':
      case 'waiting_for_resource':
      case 'manual':
      case 'scheduled':
        return 'pending';
      default:
        return 'unknown';
    }
  }

  private mapJob(job: GitLabPipelineJob): CheckRun {
    let status: CheckRun['status'];
    let conclusion: CheckRun['conclusion'];
    switch (job.status) {
      case 'created':
      case 'pending':
      case 'waiting_for_resource':
      case 'scheduled':
        status = 'queued';
        conclusion = null;
        break;
      case 'running':
        status = 'in_progress';
        conclusion = null;
        break;
      case 'success':
        status = 'completed';
        conclusion = 'success';
        break;
      case 'failed':
        status = 'completed';
        conclusion = 'failure';
        break;
      case 'canceled':
        status = 'completed';
        conclusion = 'cancelled';
        break;
      case 'skipped':
        status = 'completed';
        conclusion = 'skipped';
        break;
      case 'manual':
        // A manual job neither blocks nor fails the MR.
        status = 'completed';
        conclusion = 'neutral';
        break;
      default:
        status = 'completed';
        conclusion = 'neutral';
    }
    return { id: job.id, name: job.name, status, conclusion, html_url: job.web_url };
  }

  private async apiRequest<T>(url: string, token: string, method = 'GET', body?: object): Promise<T> {
    const headers: HeadersInit = {
      'Accept': 'application/json',
      'PRIVATE-TOKEN': token,
    };
    const options: RequestInit = { method, headers };
    if (body) {
      options.body = JSON.stringify(body);
      (options.headers as Record<string, string>)['Content-Type'] = 'application/json';
    }
    const response = await fetch(url, options);
    if (!response.ok) {
      let errorMessage = response.statusText
        ? `GitLab API request failed with status: ${response.status} ${response.statusText}`
        : `GitLab API request failed with status: ${response.status}`;
      try {
        const errorData = await response.json();
        // GitLab errors use either { message } or { error }; message may be an object.
        const message = errorData.message ?? errorData.error;
        if (typeof message === 'string') {
          errorMessage = message;
        } else if (message) {
          errorMessage = JSON.stringify(message);
        }
      } catch {
        // Non-JSON body; use the default message
      }
      throw new ApiError(errorMessage, response.status);
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }
}
