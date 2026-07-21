import { ChangeDetectionStrategy, Component, signal, computed, inject, effect } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import {
  OrgConnection,
  PrGroup,
  PrGroupData,
  PullRequest,
  CiStatus,
  connectionKey,
  normalizeHost,
  prConnectionKey,
  DEFAULT_GITHUB_HOST,
} from './models/pull-request.model';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { OrgSwitcherComponent } from './components/org-switcher/org-switcher.component';
import { PrGroupComponent } from './components/pr-group/pr-group.component';
import { OverviewPanelComponent } from './components/overview-panel/overview-panel.component';
import { FilterBarComponent, GroupSort, StatusFilter } from './components/filter-bar/filter-bar.component';
import { getSourceRepositoryUrl } from './config/source-repository-url';
import { SessionStorageService, SESSION_KEYS } from './services/session-storage.service';
import { GitHubProviderService } from './services/github-provider.service';

@Component({
  selector: 'app-root',
  imports: [SidebarComponent, OrgSwitcherComponent, PrGroupComponent, OverviewPanelComponent, FilterBarComponent],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  readonly sourceRepositoryUrl = getSourceRepositoryUrl();
  private storage = inject(SessionStorageService);
  // All platform API access goes through the provider (GitProvider); app.ts
  // only orchestrates. GitLab/GHES support (#81) will select the provider
  // per connection here.
  private provider = inject(GitHubProviderService);
  private doc = inject(DOCUMENT);

  // --- STATE SIGNALS ---
  connections = signal<OrgConnection[]>(this.loadConnections());
  // The active org filter, as a canonical connection key (see connectionKey);
  // null shows every configured organization.
  selectedOrgKey = signal<string | null>(this.loadSelectedOrgKey());
  darkMode = signal<boolean>(this.getInitialDarkMode());
  prGroups = signal<PrGroupData[]>([]);
  isLoading = signal<boolean>(false);
  error = signal<string | null>(null);
  incompleteResults = signal<boolean>(false);
  searched = signal<boolean>(false);
  expandedGroupTitles = signal<Set<string>>(new Set());
  // Keyed by PullRequest.uid — numeric ids are only unique per instance.
  expandedPrIds = signal<Set<string>>(new Set());
  sidebarOpen = signal<boolean>(false);

  // List controls (filter bar); filters narrow groups, they never hide PRs
  // inside a matching group.
  searchFilter = signal<string>('');
  statusFilter = signal<StatusFilter>('all');
  sortBy = signal<GroupSort>('failures');

  // Monotonic counter identifying the latest search. Searches can now overlap
  // (auto-search on load, refresh button, connection edits), so results from a
  // superseded search must be discarded instead of clobbering newer state.
  private searchGeneration = 0;

  // --- COMPUTED SIGNALS ---
  // Enabled when at least one connection is usable (both fields non-empty).
  // searchAndProcessPullRequests() sanitizes again before searching, so any
  // malformed entries are skipped rather than issuing an empty-token request.
  formValid = computed(() =>
    this.connections().some(c => c.organization.trim().length > 0 && c.token.trim().length > 0),
  );

  /** The connection matching the active org filter, if any. */
  selectedConnection = computed(() => {
    const key = this.selectedOrgKey();
    if (!key) return undefined;
    return this.connections().find(c => connectionKey(c) === key);
  });

  subtitle = computed(() => {
    const selected = this.selectedConnection();
    if (selected) {
      return `Monitor and manage Renovate pull requests across the ${selected.organization} organization`;
    }
    const conns = this.connections();
    if (conns.length === 1) {
      return `Monitor and manage Renovate pull requests across the ${conns[0].organization} organization`;
    }
    if (conns.length > 1) {
      return `Monitor and manage Renovate pull requests across ${conns.length} GitHub organizations`;
    }
    return 'Monitor and manage Renovate pull requests across your GitHub organizations';
  });

  /** Connections narrowed to the active org filter (all of them when unfiltered). */
  visibleConnections = computed(() => {
    const key = this.selectedOrgKey();
    if (!key) return this.connections();
    return this.connections().filter(c => connectionKey(c) === key);
  });

  /**
   * The groups shown on the board: raw groups narrowed to the active org
   * filter, with per-group display state derived from the visible PRs so
   * counts and statuses always match what is on screen.
   */
  visibleGroups = computed<PrGroup[]>(() => {
    const key = this.selectedOrgKey();
    const expanded = this.expandedGroupTitles();
    return this.prGroups()
      .map(group => {
        const prs = key
          ? group.prs.filter(pr => prConnectionKey(pr) === key)
          : group.prs;
        return {
          title: group.title,
          prs,
          aggregateCiStatus: this.calculateAggregateStatus(prs.map(pr => pr.ciStatus)),
          isExpanded: expanded.has(group.title),
          workflowSummary: this.calculateWorkflowSummary(prs),
        };
      })
      .filter(group => group.prs.length > 0);
  });

  /** visibleGroups further narrowed and ordered by the filter bar. */
  filteredGroups = computed<PrGroup[]>(() => {
    let groups = this.visibleGroups();

    const query = this.searchFilter().trim().toLowerCase();
    if (query) {
      groups = groups.filter(group =>
        group.title.toLowerCase().includes(query) ||
        group.prs.some(pr => `${pr.repoOwner}/${pr.repoName}`.toLowerCase().includes(query)),
      );
    }

    const status = this.statusFilter();
    if (status !== 'all') {
      groups = groups.filter(group => group.prs.some(pr => pr.workflowStatus === status));
    }

    const sortBy = this.sortBy();
    return [...groups].sort((a, b) => {
      switch (sortBy) {
        case 'failures':
          return b.workflowSummary.failed - a.workflowSummary.failed;
        case 'prs':
          return b.prs.length - a.prs.length;
        case 'name':
          return a.title.localeCompare(b.title);
      }
    });
  });

  /** Visible PRs whose workflows all passed — candidates for one-click merge. */
  readyToMergePrs = computed(() =>
    this.visibleGroups().flatMap(group => group.prs).filter(pr => pr.workflowStatus === 'success'),
  );

  isBulkProcessing = computed(() =>
    this.visibleGroups().some(group => group.prs.some(pr => pr.isProcessing)),
  );

  constructor() {
    effect(() => {
      if (this.darkMode()) {
        this.doc.documentElement.classList.add('dark');
      } else {
        this.doc.documentElement.classList.remove('dark');
      }
    });

    // With connection management tucked into the sidebar popover there is no
    // longer a prominent search button, so fetch automatically on startup when
    // stored connections exist.
    if (this.formValid()) {
      void this.searchAndProcessPullRequests();
    }
  }

  // --- CONNECTION MANAGEMENT ---

  onConnectionsChange(connections: OrgConnection[]): void {
    const sanitized = this.sanitizeConnections(connections);
    this.connections.set(sanitized);
    this.storage.setJson(SESSION_KEYS.connections, sanitized);

    // Reset the org filter if the selected connection was just removed.
    const key = this.selectedOrgKey();
    if (key && !sanitized.some(c => connectionKey(c) === key)) {
      this.onSelectedOrgChange(null);
    }

    // Keep results in sync with the connection list: re-search when orgs
    // remain, clear the board when the last one was removed.
    if (sanitized.length > 0) {
      void this.searchAndProcessPullRequests();
    } else {
      this.searchGeneration++; // invalidate any in-flight search
      this.prGroups.set([]);
      this.error.set(null);
      this.incompleteResults.set(false);
      this.searched.set(false);
      this.isLoading.set(false);
    }
  }

  onSelectedOrgChange(key: string | null): void {
    this.selectedOrgKey.set(key);
    this.storage.set(SESSION_KEYS.selectedOrg, key ?? '');
  }

  private loadSelectedOrgKey(): string | null {
    const stored = this.storage.get(SESSION_KEYS.selectedOrg).trim();
    if (!stored) return null;
    // Only honor a persisted selection that still matches a configured
    // connection. Sessions from before multi-host support stored the bare org
    // name, so accept that form too.
    const match = this.connections().find(
      c => connectionKey(c) === stored || c.organization.toLowerCase() === stored.toLowerCase(),
    );
    return match ? connectionKey(match) : null;
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
      const migrated: OrgConnection[] = [
        { platform: 'github', host: DEFAULT_GITHUB_HOST, organization: org, token },
      ];
      this.storage.setJson(SESSION_KEYS.connections, migrated);
      // Drop the now-migrated legacy keys so they don't linger for the session.
      this.storage.remove(SESSION_KEYS.organization);
      this.storage.remove(SESSION_KEYS.token);
      return migrated;
    }

    return [];
  }

  /**
   * Trim, drop entries missing an org or token or with an unparsable host,
   * normalize platform/host (connections stored before multi-platform support
   * have neither — they default to github.com), and de-duplicate by the
   * canonical connection key.
   */
  private sanitizeConnections(connections: OrgConnection[]): OrgConnection[] {
    const seen = new Set<string>();
    const result: OrgConnection[] = [];
    for (const c of connections) {
      if (!c || typeof c.organization !== 'string' || typeof c.token !== 'string') {
        continue;
      }
      const organization = c.organization.trim();
      const token = c.token.trim();
      if (!organization || !token) {
        continue;
      }

      const platform = c.platform === 'gitlab' ? 'gitlab' : 'github';
      const host = normalizeHost(typeof c.host === 'string' ? c.host : '');
      if (!host) {
        continue;
      }
      const renovateAuthor =
        typeof c.renovateAuthor === 'string' && c.renovateAuthor.trim() ? c.renovateAuthor.trim() : undefined;

      const normalized: OrgConnection = renovateAuthor
        ? { platform, host, organization, token, renovateAuthor }
        : { platform, host, organization, token };
      const key = connectionKey(normalized);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(normalized);
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
    const generation = ++this.searchGeneration;
    this.isLoading.set(true);
    this.error.set(null);
    this.prGroups.set([]);
    this.incompleteResults.set(false);
    this.searched.set(true);

    // Sanitize again here so the search never issues a request for a malformed
    // connection, regardless of how connections() was populated. formValid()
    // guarantees at least one survives.
    const connections = this.sanitizeConnections(this.connections());

    try {
      // Step 1: Search for all open Renovate PRs across all configured
      // connections in parallel. Use allSettled so one org's failure doesn't
      // discard the others' results — merge what succeeded and flag the rest
      // as incomplete.
      const searchResults = await Promise.allSettled(
        connections.map(conn => this.provider.searchRenovatePrs(conn))
      );

      if (generation !== this.searchGeneration) return; // superseded by a newer search

      // If every org failed, surface the error rather than a misleading empty state.
      const firstRejection = searchResults.find(r => r.status === 'rejected');
      if (firstRejection?.status === 'rejected' && !searchResults.some(r => r.status === 'fulfilled')) {
        throw firstRejection.reason instanceof Error
          ? firstRejection.reason
          : new Error('Search failed for all configured organizations.');
      }

      // Merge results from all orgs; a rejected org counts as incomplete.
      const allPrs: PullRequest[] = [];
      let anyIncomplete = false;
      for (const result of searchResults) {
        if (result.status === 'fulfilled') {
          allPrs.push(...result.value.prs);
          if (result.value.incompleteResults) anyIncomplete = true;
        } else {
          anyIncomplete = true;
          console.error('Renovate PR search failed for one organization', result.reason);
        }
      }
      this.incompleteResults.set(anyIncomplete);

      if (allPrs.length === 0) {
        this.prGroups.set([]);
        return;
      }

      // Step 2: Group PRs by title
      const groupsMap = new Map<string, PrGroupData>();
      for (const pr of allPrs) {
        if (!groupsMap.has(pr.title)) {
          groupsMap.set(pr.title, { title: pr.title, prs: [] });
        }
        groupsMap.get(pr.title)!.prs.push(pr);
      }

      // Step 3: Fetch detailed data for each PR in batches to avoid secondary rate limits
      const BATCH_SIZE = 10;
      for (let i = 0; i < allPrs.length; i += BATCH_SIZE) {
        if (generation !== this.searchGeneration) return; // stop fetching for a superseded search
        await Promise.all(allPrs.slice(i, i + BATCH_SIZE).map(pr => this.provider.fetchPrDetails(pr)));
      }

      if (generation !== this.searchGeneration) return;

      // Aggregate statuses and workflow summaries are derived per visible
      // group by the visibleGroups computed, so only raw data is stored.
      this.prGroups.set(Array.from(groupsMap.values()));
      this.expandedGroupTitles.set(new Set());
      this.expandedPrIds.set(new Set());

    } catch (e: unknown) {
      if (generation !== this.searchGeneration) return;
      const message = e instanceof Error ? e.message : 'An unknown error occurred.';
      this.error.set(message);
    } finally {
      // A superseded search must not clear the loading state the newer one owns.
      if (generation === this.searchGeneration) {
        this.isLoading.set(false);
      }
    }
  }

  // --- INDIVIDUAL API ACTIONS ---

  async closePullRequest(prToUpdate: PullRequest) {
    this.setPrProcessingState(prToUpdate, true);
    try {
      await this.provider.close(prToUpdate);
      // Remove PR from UI
      this.removePrFromGroup(prToUpdate);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.error.set(`Failed to close PR #${prToUpdate.number}: ${message}`);
      this.setPrProcessingState(prToUpdate, false);
    }
  }

  async approveAndMergePullRequest(prToUpdate: PullRequest) {
    this.setPrProcessingState(prToUpdate, true);
    try {
      // Check if any workflow jobs are failing
      if (prToUpdate.workflowStatus === 'failure') {
        throw new Error('Cannot merge PR with failing workflow checks');
      }

      await this.provider.approveAndMerge(prToUpdate);

      // Remove PR from UI
      this.removePrFromGroup(prToUpdate);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.error.set(`Failed to merge PR #${prToUpdate.number}: ${message}`);
      this.setPrProcessingState(prToUpdate, false);
    }
  }

  /** Approve and merge every visible PR whose workflows passed. */
  async mergeAllReady() {
    const prsSnapshot = [...this.readyToMergePrs()];
    for (const pr of prsSnapshot) {
      await this.approveAndMergePullRequest(pr);
    }
  }

  clearFilters(): void {
    this.searchFilter.set('');
    this.statusFilter.set('all');
  }

  async closeGroupPullRequests(group: PrGroup) {
    const prsSnapshot = [...group.prs];
    if (prsSnapshot.length === 0) {
      return;
    }

    for (const pr of prsSnapshot) {
      await this.closePullRequest(pr);
    }
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
      await this.approveAndMergePullRequest(pr);
    }
  }

  // --- HELPER & UTILITY METHODS ---

  removePrFromGroup(prToRemove: PullRequest) {
    const updatedGroups = this.prGroups()
      .map(group => ({ ...group, prs: group.prs.filter(p => p.uid !== prToRemove.uid) }))
      .filter(group => group.prs.length > 0); // Remove group if it becomes empty
    this.prGroups.set(updatedGroups);

    if (this.expandedPrIds().has(prToRemove.uid)) {
      const updated = new Set(this.expandedPrIds());
      updated.delete(prToRemove.uid);
      this.expandedPrIds.set(updated);
    }
  }

  setPrProcessingState(prToUpdate: PullRequest, isProcessing: boolean) {
     prToUpdate.isProcessing = isProcessing;
     this.prGroups.set([...this.prGroups()]); // New array identity so visibleGroups recomputes
  }

  toggleGroup(group: PrGroup) {
    const expanded = new Set(this.expandedGroupTitles());
    if (expanded.has(group.title)) {
      expanded.delete(group.title);
      // Collapse the group's PR detail panels along with it.
      const prIds = new Set(this.expandedPrIds());
      group.prs.forEach(pr => prIds.delete(pr.uid));
      this.expandedPrIds.set(prIds);
    } else {
      expanded.add(group.title);
    }
    this.expandedGroupTitles.set(expanded);
  }

  togglePullRequest(pr: PullRequest) {
    const updated = new Set(this.expandedPrIds());
    if (updated.has(pr.uid)) {
      updated.delete(pr.uid);
    } else {
      updated.add(pr.uid);
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

}
