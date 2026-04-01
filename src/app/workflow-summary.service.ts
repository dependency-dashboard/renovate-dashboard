import { Injectable } from '@angular/core';
import {
  CiStatus,
  GitHubCheckRunsResponse,
  GitHubCombinedStatusResponse,
  GitHubIssueSearchItem,
  GitHubPullRequestDetails,
  GitHubSearchIssuesResponse,
} from './models/pull-request.model';

export interface WorkflowSummary {
  success: number;
  pending: number;
  failed: number;
  incompleteResults?: boolean;
}

@Injectable({ providedIn: 'root' })
export class WorkflowSummaryService {
  
  async getSummary(organization: string, token: string): Promise<WorkflowSummary> {
    if (!organization || !token) {
      return { success: 0, pending: 0, failed: 0 };
    }

    try {
      return await this.fetchWorkflowSummary(organization, token);
    } catch (error) {
      console.error('Failed to fetch workflow summary', error);
      return { success: 0, pending: 0, failed: 0 };
    }
  }

  private async fetchAllSearchItems(query: string, token: string): Promise<{ items: GitHubIssueSearchItem[]; incompleteResults: boolean }> {
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `token ${token}`
    };
    const allItems: GitHubIssueSearchItem[] = [];
    let incompleteResults = false;
    let page = 1;

    while (page <= 10) {
      const params = new URLSearchParams({ q: query, per_page: '100', page: String(page) });
      const url = `https://api.github.com/search/issues?${params.toString()}`;
      const response = await fetch(url, { headers });
      if (!response.ok) {
        throw new Error(`Failed to search PRs: ${response.status}`);
      }
      const data = await response.json() as GitHubSearchIssuesResponse;
      allItems.push(...data.items);
      if (data.incomplete_results) {
        incompleteResults = true;
      }
      if (data.items.length < 100 || allItems.length >= data.total_count) {
        break;
      }
      page++;
      if (page > 10) {
        incompleteResults = true;
      }
    }

    return { items: allItems, incompleteResults };
  }

  private async fetchWorkflowSummary(organization: string, token: string): Promise<WorkflowSummary> {
    const { items, incompleteResults } = await this.fetchAllSearchItems(
      `is:pr author:app/renovate org:${organization} is:open`,
      token
    );

    if (items.length === 0) {
      return { success: 0, pending: 0, failed: 0, incompleteResults };
    }

    // Count workflow statuses for all PRs
    let success = 0;
    let pending = 0;
    let failed = 0;

    const getStatus = async (item: GitHubIssueSearchItem) => {
      const repoUrlParts = item.repository_url.split('/');
      const repoName = repoUrlParts.pop();
      const repoOwner = repoUrlParts.pop();

      if (!repoOwner || !repoName) {
        return 'unknown';
      }

      try {
        // Get PR details to get the head SHA
        const prUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/pulls/${item.number}`;
        const prResponse = await fetch(prUrl, {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': `token ${token}`
          }
        });

        if (!prResponse.ok) {
          return 'unknown';
        }

  const prData = await prResponse.json() as GitHubPullRequestDetails;
        const headSha = prData.head.sha;

        // Get check runs for the PR's head commit
        const checksUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/commits/${headSha}/check-runs`;
        const checksResponse = await fetch(checksUrl, {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': `token ${token}`
          }
        });

        if (!checksResponse.ok) {
          return 'unknown';
        }

  const checksData = await checksResponse.json() as GitHubCheckRunsResponse;
        
  if (!checksData.check_runs || checksData.check_runs.length === 0) {
          // Fallback to combined status
          const statusUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/commits/${headSha}/status`;
          const statusResponse = await fetch(statusUrl, {
            headers: {
              'Accept': 'application/vnd.github.v3+json',
              'Authorization': `token ${token}`
            }
          });

          if (statusResponse.ok) {
            const statusData = await statusResponse.json() as GitHubCombinedStatusResponse;
            return this.mapCombinedStatus(statusData.state);
          }
          return 'unknown';
        }

        // Determine overall status from check runs
        const conclusions = checksData.check_runs.map(cr => cr.conclusion);
  const statuses = checksData.check_runs.map(cr => cr.status);

        if (conclusions.some(c => c === 'failure' || c === 'timed_out')) {
          return 'failure';
        } else if (statuses.some(s => s === 'in_progress' || s === 'queued')) {
          return 'pending';
        } else if (conclusions.every(c => c === 'success' || c === 'skipped' || c === 'neutral')) {
          return 'success';
        }
        
        return 'unknown';
      } catch (error: unknown) {
        console.error(`Error fetching workflow status for PR ${item.number}:`, error);
        return 'unknown';
      }
    };

    // Process PRs in batches of 10 to avoid secondary rate limits
    const BATCH_SIZE = 10;
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      const batchStatuses = await Promise.all(batch.map(getStatus));
      batchStatuses.forEach(status => {
        switch (status) {
          case 'success': success++; break;
          case 'pending': pending++; break;
          case 'failure': failed++; break;
        }
      });
    }

    return { success, pending, failed, incompleteResults };
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
}
