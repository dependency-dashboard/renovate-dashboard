import { ChangeDetectionStrategy, Component, signal, computed, inject, effect } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import {
  OrgConnection,
  PrGroup,
  PullRequest,
  GitHubCheckRunsResponse,
  GitHubCombinedStatusResponse,
  GitHubIssueSearchItem,
  GitHubPullRequestDetails,
  GitHubRepository,
  CiStatus,
} from './models/pull-request.model';
import { SearchFormComponent } from './components/search-form/search-form.component';
import { PrGroupComponent } from './components/pr-group/pr-group.component';
import { WorkflowSummaryComponent } from './workflow-summary.component';
import { getSourceRepositoryUrl } from './config/source-repository-url';
import { SessionStorageService, SESSION_KEYS } from './services/session-storage.service';
import { GitHubSearchService } from './services/github-search.service';

@Component({
  selector: 'app-root',
  imports: [SearchFormComponent, PrGroupComponent, WorkflowSummaryComponent],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  readonly sourceRepositoryUrl = getSourceRepositoryUrl();
  private storage = inject(SessionStorageService);
  private githubSearch = inject(GitHubSearchService);
  private doc = inject(DOCUMENT);

  // --- STATE SIGNALS ---
  connections = signal<OrgConnection[]>(this.loadConnections());
  darkMode = signal<boolean>(this.getInitialDarkMode());
  prGroups = signal<PrGroup[]>([]);
  isLoading = signal<boolean>(false);
  error = signal<string | null>(null);
  incompleteResults = signal<boolean>(false);
  searched = signal<boolean>(false);
  workflowRefreshTrigger = signal<number>(0);
  expandedPrIds = signal<Set<number>>(new Set());

  // --- COMPUTED SIGNALS ---
  // Valid only when at least one connection has both an org and a token, so a
  // malformed entry (e.g. from a partial legacy migration) can't enable a search
  // that would fail with an empty token.
  formValid = computed(() =>
    this.connections().some(c => c.organization.trim().length > 0 && c.token.trim().length > 0),
  );

  constructor() {
    effect(() => {
      if (this.darkMode()) {
        this.doc.documentElement.classList.add('dark');
      } else {
        this.doc.documentElement.classList.remove('dark');
      }
    });
  }

  // --- CONNECTION MANAGEMENT ---

  onConnectionsChange(connections: OrgConnection[]): void {
    const sanitized = this.sanitizeConnections(connections);
    this.connections.set(sanitized);
    this.storage.setJson(SESSION_KEYS.connections, sanitized);
  }

  private loadConnections(): OrgConnection[] {
    // The new connections key is authoritative once present — even an empty
    // array means "the user has no orgs configured", so we must not fall back
    // to migrating legacy keys (that would repopulate after removing all orgs).
    const stored = this.storage.getJson<OrgConnection[]>(SESSION_KEYS.connections);
    if (Array.isArray(stored)) {
      return this.sanitizeConnections(stored);
    }

    // Migrate from old single-org keys only when the new key is absent, and
    // only when both legacy values are non-empty after trimming (a lone org or
    // token can't make a valid connection).
    const org = this.storage.get(SESSION_KEYS.organization).trim();
    const token = this.storage.get(SESSION_KEYS.token).trim();
    if (org && token) {
      const migrated: OrgConnection[] = [{ organization: org, token }];
      this.storage.setJson(SESSION_KEYS.connections, migrated);
      return migrated;
    }

    return [];
  }

  /** Trim, drop entries missing an org or token, and de-duplicate by org (case-insensitive). */
  private sanitizeConnections(connections: OrgConnection[]): OrgConnection[] {
    const seen = new Set<string>();
    const result: OrgConnection[] = [];
    for (const c of connections) {
      if (!c || typeof c.organization !== 'string' || typeof c.token !== 'string') {
        continue;
      }
      const organization = c.organization.trim();
      const token = c.token.trim();
      const key = organization.toLowerCase();
      if (!organization || !token || seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push({ organization, token });
    }
    return result;
  }

  // --- DARK MODE ---

  private getInitialDarkMode(): boolean {
    try {
      const stored = localStorage.getItem('theme');
      if (stored) return stored === 'dark';
    } catch { /* storage unavailable */ }
    try {
      if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
    } catch { /* matchMedia unavailable */ }
    return false;
  }

  toggleDarkMode(): void {
    const next = !this.darkMode();
    this.darkMode.set(next);
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light');
    } catch { /* storage unavailable */ }
  }

  // --- API ORCHESTRATION ---
  async searchAndProcessPullRequests() {
    if (!this.formValid()) {
      this.error.set("At least one organization connection is required.");
      return;
    }
    this.isLoading.set(true);
    this.error.set(null);
    this.prGroups.set([]);
    this.incompleteResults.set(false);
    this.searched.set(true);

    const connections = this.connections();

    try {
      // Step 1: Search for all open Renovate PRs across all configured orgs in
      // parallel. Use allSettled so one org's failure doesn't discard the others'
      // results — merge what succeeded and flag the rest as incomplete.
      const searchResults = await Promise.allSettled(
        connections.map(conn =>
          this.githubSearch.fetchAllSearchItems(
            `is:pr author:app/renovate org:${conn.organization} is:open`,
            conn.token
          )
        )
      );

      // If every org failed, surface the error rather than a misleading empty state.
      const firstRejection = searchResults.find(r => r.status === 'rejected');
      if (firstRejection?.status === 'rejected' && !searchResults.some(r => r.status === 'fulfilled')) {
        throw firstRejection.reason instanceof Error
          ? firstRejection.reason
          : new Error('Search failed for all configured organizations.');
      }

      // Merge results from all orgs; a rejected org counts as incomplete.
      const allItems: GitHubIssueSearchItem[] = [];
      let anyIncomplete = false;
      for (const result of searchResults) {
        if (result.status === 'fulfilled') {
          allItems.push(...result.value.items);
          if (result.value.incompleteResults) anyIncomplete = true;
        } else {
          anyIncomplete = true;
          console.error('Renovate PR search failed for one organization', result.reason);
        }
      }
      this.incompleteResults.set(anyIncomplete);

      if (allItems.length === 0) {
        this.prGroups.set([]);
        return;
      }

      // Build a lookup map from org name → token for PR construction
      const tokenByOrg = new Map(connections.map(c => [c.organization.toLowerCase(), c.token]));

      // Step 2: Group PRs by title
      const groupsMap = new Map<string, PrGroup>();
      allItems.forEach((item: GitHubIssueSearchItem) => {
        const repoUrlParts = item.repository_url.split('/');
        const repoName = repoUrlParts.pop();
        const repoOwner = repoUrlParts.pop();

        if (!repoOwner || !repoName) {
          return;
        }

        // Every returned PR should belong to a configured org, but guard against
        // an unexpected owner rather than issuing an API call with an empty token.
        const orgToken = tokenByOrg.get(repoOwner.toLowerCase());
        if (!orgToken) {
          console.warn(`No configured token for "${repoOwner}"; skipping PR #${item.number}`);
          return;
        }

        const pr: PullRequest = {
          id: item.id,
          number: item.number,
          title: item.title,
          html_url: item.html_url,
          user: { login: item.user.login, avatar_url: item.user.avatar_url },
          created_at: item.created_at,
          labels: item.labels,
          repoOwner: repoOwner,
          repoName: repoName,
          head: { sha: '' }, // Will be fetched later
          isModified: false, // Default
          ciStatus: 'unknown', // Default
          checkRuns: [], // Initialize as empty
          isProcessing: false,
          workflowStatus: 'unknown', // Default
          orgToken,
        };

        if (!groupsMap.has(pr.title)) {
          groupsMap.set(pr.title, {
            title: pr.title,
            prs: [],
            aggregateCiStatus: 'unknown',
            isExpanded: false,
            workflowSummary: { success: 0, pending: 0, failed: 0 }
          });
        }
        groupsMap.get(pr.title)!.prs.push(pr);
      });

      // Step 3: Fetch detailed data for each PR in batches to avoid secondary rate limits
      const allPrs = Array.from(groupsMap.values()).flatMap(g => g.prs);
      const BATCH_SIZE = 10;
      for (let i = 0; i < allPrs.length; i += BATCH_SIZE) {
        await Promise.all(allPrs.slice(i, i + BATCH_SIZE).map(pr => this.fetchPrDetails(pr)));
      }

      // Step 4: Calculate aggregate status and workflow summary for each group
      groupsMap.forEach(group => {
        group.aggregateCiStatus = this.calculateAggregateStatus(group.prs.map(p => p.ciStatus));
        group.workflowSummary = this.calculateWorkflowSummary(group.prs);
      });

      this.prGroups.set(Array.from(groupsMap.values()));
      this.expandedPrIds.set(new Set());

      // Trigger workflow summary refresh
      this.bumpWorkflowSummaryRefresh();

    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'An unknown error occurred.';
      this.error.set(message);
    } finally {
      this.isLoading.set(false);
    }
  }

  // --- INDIVIDUAL API ACTIONS ---

  async fetchPrDetails(pr: PullRequest) {
    try {
      // Get full PR data (for commit count and head SHA)
      const prUrl = `https://api.github.com/repos/${pr.repoOwner}/${pr.repoName}/pulls/${pr.number}`;
      const prData = await this.apiRequest<GitHubPullRequestDetails>(prUrl, pr.orgToken);
      pr.isModified = prData.commits > 1;
      pr.head.sha = prData.head.sha;
      pr.commits = prData.commits;

      // Get repository settings to determine allowed merge methods
      const repoUrl = `https://api.github.com/repos/${pr.repoOwner}/${pr.repoName}`;
      const repoData = await this.apiRequest<GitHubRepository>(repoUrl, pr.orgToken);
      pr.allowSquashMerge = repoData.allow_squash_merge;
      pr.allowMergeCommit = repoData.allow_merge_commit;
      pr.allowRebaseMerge = repoData.allow_rebase_merge;

      // Get combined CI status for the PR's head commit (as a fallback)
      const statusUrl = `https://api.github.com/repos/${pr.repoOwner}/${pr.repoName}/commits/${pr.head.sha}/status`;
      const statusData = await this.apiRequest<GitHubCombinedStatusResponse>(statusUrl, pr.orgToken);
      pr.ciStatus = this.mapCombinedStatus(statusData.state);

      // Get individual check runs for more detailed status
      const checksUrl = `https://api.github.com/repos/${pr.repoOwner}/${pr.repoName}/commits/${pr.head.sha}/check-runs`;
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
      pr.ciStatus = 'unknown'; // Mark as unknown on failure
      pr.workflowStatus = 'unknown'; // Mark workflow as unknown on failure
      pr.checkRuns = []; // Ensure it's an empty array on failure
    }
  }

  async closePullRequest(prToUpdate: PullRequest, refreshSummary = true) {
    this.setPrProcessingState(prToUpdate, true);
    try {
      const url = `https://api.github.com/repos/${prToUpdate.repoOwner}/${prToUpdate.repoName}/pulls/${prToUpdate.number}`;
      await this.apiRequest<void>(url, prToUpdate.orgToken, 'PATCH', { state: 'closed' });
      // Remove PR from UI
      this.removePrFromGroup(prToUpdate);
      if (refreshSummary) {
        this.bumpWorkflowSummaryRefresh();
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.error.set(`Failed to close PR #${prToUpdate.number}: ${message}`);
      this.setPrProcessingState(prToUpdate, false);
    }
  }

  async approveAndMergePullRequest(prToUpdate: PullRequest, refreshSummary = true) {
    this.setPrProcessingState(prToUpdate, true);
    try {
      // Check if any workflow jobs are failing
      if (prToUpdate.workflowStatus === 'failure') {
        throw new Error('Cannot merge PR with failing workflow checks');
      }

      // Step 1: Approve
      const reviewUrl = `https://api.github.com/repos/${prToUpdate.repoOwner}/${prToUpdate.repoName}/pulls/${prToUpdate.number}/reviews`;
      await this.apiRequest<void>(reviewUrl, prToUpdate.orgToken, 'POST', { event: 'APPROVE' });

      // Step 2: Determine merge method
      const mergeMethod = this.determineMergeMethod(prToUpdate);

      // Step 3: Merge with the appropriate method
      const mergeUrl = `https://api.github.com/repos/${prToUpdate.repoOwner}/${prToUpdate.repoName}/pulls/${prToUpdate.number}/merge`;
      await this.apiRequest<void>(mergeUrl, prToUpdate.orgToken, 'PUT', { merge_method: mergeMethod });

      // Remove PR from UI
      this.removePrFromGroup(prToUpdate);
      if (refreshSummary) {
        this.bumpWorkflowSummaryRefresh();
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.error.set(`Failed to merge PR #${prToUpdate.number}: ${message}`);
      this.setPrProcessingState(prToUpdate, false);
    }
  }

  async closeGroupPullRequests(group: PrGroup) {
    const prsSnapshot = [...group.prs];
    if (prsSnapshot.length === 0) {
      return;
    }

    for (const pr of prsSnapshot) {
      await this.closePullRequest(pr, false);
    }

    this.bumpWorkflowSummaryRefresh();
  }

  async approveAndMergeGroupPullRequests(group: PrGroup) {
    const prsSnapshot = [...group.prs];
    if (prsSnapshot.length === 0) {
      return;
    }

    // Filter out PRs with failing workflows
    const prsToMerge = prsSnapshot.filter(pr => pr.workflowStatus !== 'failure');

    if (prsToMerge.length === 0) {
      this.error.set('All PRs in this group have failing workflows and cannot be merged.');
      return;
    }

    for (const pr of prsToMerge) {
      await this.approveAndMergePullRequest(pr, false);
    }

    this.bumpWorkflowSummaryRefresh();
  }

  // --- HELPER & UTILITY METHODS ---

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

  removePrFromGroup(prToRemove: PullRequest) {
    const currentGroups = this.prGroups();
    const updatedGroups = currentGroups.map(group => {
      // Filter out the closed/merged PR
      group.prs = group.prs.filter(p => p.id !== prToRemove.id);
      return group;
    }).filter(group => group.prs.length > 0); // Remove group if it becomes empty
    this.prGroups.set(updatedGroups);

    if (this.expandedPrIds().has(prToRemove.id)) {
      const updated = new Set(this.expandedPrIds());
      updated.delete(prToRemove.id);
      this.expandedPrIds.set(updated);
    }
  }

  setPrProcessingState(prToUpdate: PullRequest, isProcessing: boolean) {
     prToUpdate.isProcessing = isProcessing;
     this.prGroups.set([...this.prGroups()]); // Trigger change detection
  }

  toggleGroup(group: PrGroup) {
    group.isExpanded = !group.isExpanded;
    if (!group.isExpanded) {
      const updated = new Set(this.expandedPrIds());
      group.prs.forEach(pr => updated.delete(pr.id));
      this.expandedPrIds.set(updated);
    }
    this.prGroups.set([...this.prGroups()]); // Trigger change detection
  }

  togglePullRequest(pr: PullRequest) {
    const updated = new Set(this.expandedPrIds());
    if (updated.has(pr.id)) {
      updated.delete(pr.id);
    } else {
      updated.add(pr.id);
    }
    this.expandedPrIds.set(updated);
  }

  calculateAggregateStatus(statuses: CiStatus[]): PrGroup['aggregateCiStatus'] {
    if (statuses.some(s => s === 'failure')) return 'failure';
    if (statuses.some(s => s === 'pending')) return 'pending';
    if (statuses.length === 0) return 'unknown';
    if (statuses.every(s => s === 'success')) return 'success';
    return 'mixed';
  }

  calculateWorkflowSummary(prs: PullRequest[]): { success: number; pending: number; failed: number; } {
    let success = 0;
    let pending = 0;
    let failed = 0;

    prs.forEach(pr => {
      switch (pr.workflowStatus) {
        case 'success':
          success++;
          break;
        case 'pending':
          pending++;
          break;
        case 'failure':
          failed++;
          break;
        // 'unknown' statuses are not counted
      }
    });

    return { success, pending, failed };
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

  private bumpWorkflowSummaryRefresh(): void {
    this.workflowRefreshTrigger.set(this.workflowRefreshTrigger() + 1);
  }
}
