import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { App } from './app';
import { getSourceRepositoryUrl } from './config/source-repository-url';
import { PullRequest, PrGroup, OrgConnection, DEFAULT_GITHUB_HOST, connectionKey } from './models/pull-request.model';
import { SessionStorageService } from './services/session-storage.service';
import { GitHubProviderService } from './services/github-provider.service';
import { GitLabProviderService } from './services/gitlab-provider.service';

function conn(organization: string, token: string): OrgConnection {
  return { platform: 'github', host: DEFAULT_GITHUB_HOST, organization, token };
}

/** Canonical connection key for a default-host GitHub org. */
function orgKey(organization: string): string {
  return connectionKey({ platform: 'github', host: DEFAULT_GITHUB_HOST, organization });
}

function makePr(overrides: Partial<PullRequest> = {}): PullRequest {
  const id = overrides.id ?? 1;
  return {
    id,
    uid: `github|https://github.com|${id}`,
    platform: 'github',
    host: 'https://github.com',
    number: 1,
    title: 'Update dependency foo to v2',
    html_url: 'https://github.com/org/repo/pull/1',
    user: { login: 'renovate[bot]', avatar_url: '' },
    created_at: '2024-01-01T00:00:00Z',
    labels: [],
    repoOwner: 'test-org',
    repoName: 'test-repo',
    head: { sha: 'abc123' },
    isModified: false,
    ciStatus: 'unknown',
    checkRuns: [],
    isProcessing: false,
    workflowStatus: 'unknown',
    orgToken: 'ghp_test',
    ...overrides,
  };
}

function makeGroup(overrides: Partial<PrGroup> = {}): PrGroup {
  return {
    title: 'Update dependency foo to v2',
    prs: [],
    aggregateCiStatus: 'unknown',
    isExpanded: false,
    workflowSummary: { success: 0, pending: 0, failed: 0 },
    ...overrides,
  };
}

function mockMatchMedia(prefersDark: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)' ? prefersDark : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('App', () => {
  beforeEach(async () => {
    // Tests that use the real SessionStorageService write to jsdom's
    // sessionStorage; clear it so state never leaks between tests.
    sessionStorage.clear();
    mockMatchMedia(false);
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  function makeStorageSpy(connectionsValue: unknown = null, orgValue = '', tokenValue = '', selectedOrgValue = '') {
    return {
      get: vi.fn((key: string) => {
        if (key === 'organization') return orgValue;
        if (key === 'token') return tokenValue;
        if (key === 'selectedOrg') return selectedOrgValue;
        return '';
      }),
      set: vi.fn(),
      remove: vi.fn(),
      getJson: vi.fn((key: string) => key === 'connections' ? connectionsValue : null),
      setJson: vi.fn(),
    };
  }

  /** Stub the provider's search so constructor auto-search resolves harmlessly. */
  function stubSearchService() {
    const provider = {
      searchRenovatePrs: vi.fn().mockResolvedValue({ prs: [], incompleteResults: false }),
    };
    TestBed.overrideProvider(GitHubProviderService, { useValue: provider });
    return provider;
  }

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render title', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Renovate Dashboard');
  });

  it('should render the page heading as an h1', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const h1 = fixture.nativeElement.querySelector('h1');
    expect(h1).toBeTruthy();
    expect(h1!.textContent?.trim()).toContain('Overview');
  });

  it('should render GitHub link to source repository', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const githubLink = compiled.querySelector('a[aria-label="View source on GitHub"]');
    expect(githubLink).toBeTruthy();
    expect(githubLink?.getAttribute('href')).toBe(getSourceRepositoryUrl());
    expect(githubLink?.getAttribute('target')).toBe('_blank');
    expect(githubLink?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(githubLink?.getAttribute('aria-label')).toBe('View source on GitHub');
  });

  describe('formValid', () => {
    it('is false when no connections are configured', () => {
      const app = TestBed.createComponent(App).componentInstance;
      app.connections.set([]);
      expect(app.formValid()).toBe(false);
    });

    it('is true when at least one connection is configured', () => {
      const app = TestBed.createComponent(App).componentInstance;
      app.connections.set([conn('my-org', 'ghp_token')]);
      expect(app.formValid()).toBe(true);
    });

    it('is true when multiple connections are configured', () => {
      const app = TestBed.createComponent(App).componentInstance;
      app.connections.set([
        conn('org-a', 'ghp_aaa'),
        conn('org-b', 'ghp_bbb'),
      ]);
      expect(app.formValid()).toBe(true);
    });

    it('is false when the only connection has an empty token', () => {
      const app = TestBed.createComponent(App).componentInstance;
      app.connections.set([conn('my-org', '')]);
      expect(app.formValid()).toBe(false);
    });

    it('is false when the only connection has a whitespace-only org', () => {
      const app = TestBed.createComponent(App).componentInstance;
      app.connections.set([conn('   ', 'ghp_token')]);
      expect(app.formValid()).toBe(false);
    });
  });

  describe('calculateAggregateStatus', () => {
    it('returns unknown for empty array', () => {
      const app = TestBed.createComponent(App).componentInstance;
      expect(app.calculateAggregateStatus([])).toBe('unknown');
    });

    it('returns success when all statuses are success', () => {
      const app = TestBed.createComponent(App).componentInstance;
      expect(app.calculateAggregateStatus(['success', 'success'])).toBe('success');
    });

    it('returns failure when any status is failure', () => {
      const app = TestBed.createComponent(App).componentInstance;
      expect(app.calculateAggregateStatus(['success', 'failure', 'pending'])).toBe('failure');
    });

    it('returns pending when any status is pending and no failures', () => {
      const app = TestBed.createComponent(App).componentInstance;
      expect(app.calculateAggregateStatus(['success', 'pending'])).toBe('pending');
    });

    it('returns mixed for a mix of success and unknown', () => {
      const app = TestBed.createComponent(App).componentInstance;
      expect(app.calculateAggregateStatus(['success', 'unknown'])).toBe('mixed');
    });
  });

  describe('calculateWorkflowSummary', () => {
    it('returns zeros for empty PR list', () => {
      const app = TestBed.createComponent(App).componentInstance;
      expect(app.calculateWorkflowSummary([])).toEqual({ success: 0, pending: 0, failed: 0 });
    });

    it('counts each status correctly', () => {
      const app = TestBed.createComponent(App).componentInstance;
      const prs = [
        makePr({ workflowStatus: 'success' }),
        makePr({ workflowStatus: 'success' }),
        makePr({ workflowStatus: 'pending' }),
        makePr({ workflowStatus: 'failure' }),
      ];
      expect(app.calculateWorkflowSummary(prs)).toEqual({ success: 2, pending: 1, failed: 1 });
    });

    it('does not count unknown statuses', () => {
      const app = TestBed.createComponent(App).componentInstance;
      const prs = [makePr({ workflowStatus: 'unknown' }), makePr({ workflowStatus: 'unknown' })];
      expect(app.calculateWorkflowSummary(prs)).toEqual({ success: 0, pending: 0, failed: 0 });
    });
  });

  describe('removePrFromGroup', () => {
    it('removes the group when its only PR is removed', () => {
      const app = TestBed.createComponent(App).componentInstance;
      const pr = makePr({ id: 1 });
      app.prGroups.set([makeGroup({ prs: [pr] })]);

      app.removePrFromGroup(pr);

      expect(app.prGroups()).toHaveLength(0);
    });

    it('leaves other PRs in the group intact', () => {
      const app = TestBed.createComponent(App).componentInstance;
      const pr1 = makePr({ id: 1 });
      const pr2 = makePr({ id: 2 });
      app.prGroups.set([makeGroup({ prs: [pr1, pr2] })]);

      app.removePrFromGroup(pr1);

      expect(app.prGroups()[0].prs).toHaveLength(1);
      expect(app.prGroups()[0].prs[0].id).toBe(2);
    });

    it('removes the PR id from expandedPrIds', () => {
      const app = TestBed.createComponent(App).componentInstance;
      const pr = makePr({ id: 42 });
      app.prGroups.set([makeGroup({ prs: [pr] })]);
      app.expandedPrIds.set(new Set([pr.uid]));

      app.removePrFromGroup(pr);

      expect(app.expandedPrIds().has(pr.uid)).toBe(false);
    });
  });

  describe('toggleGroup', () => {
    it('expands a collapsed group', () => {
      const app = TestBed.createComponent(App).componentInstance;
      const group = makeGroup({ prs: [makePr()] });
      app.prGroups.set([group]);

      app.toggleGroup(group);

      expect(app.expandedGroupTitles().has(group.title)).toBe(true);
      expect(app.visibleGroups()[0].isExpanded).toBe(true);
    });

    it('collapses an expanded group and clears its PR ids from expandedPrIds', () => {
      const app = TestBed.createComponent(App).componentInstance;
      const pr = makePr({ id: 7 });
      const group = makeGroup({ prs: [pr] });
      app.prGroups.set([group]);
      app.expandedGroupTitles.set(new Set([group.title]));
      app.expandedPrIds.set(new Set([pr.uid]));

      app.toggleGroup(group);

      expect(app.expandedGroupTitles().has(group.title)).toBe(false);
      expect(app.visibleGroups()[0].isExpanded).toBe(false);
      expect(app.expandedPrIds().has(pr.uid)).toBe(false);
    });
  });

  describe('togglePullRequest', () => {
    it('adds the PR uid to expandedPrIds when not present', () => {
      const app = TestBed.createComponent(App).componentInstance;
      const pr = makePr({ id: 5 });
      app.togglePullRequest(pr);
      expect(app.expandedPrIds().has(pr.uid)).toBe(true);
    });

    it('removes the PR uid from expandedPrIds when already present', () => {
      const app = TestBed.createComponent(App).componentInstance;
      const pr = makePr({ id: 5 });
      app.expandedPrIds.set(new Set([pr.uid]));
      app.togglePullRequest(pr);
      expect(app.expandedPrIds().has(pr.uid)).toBe(false);
    });
  });

  describe('approveAndMergeGroupPullRequests', () => {
    it('skips PRs with failing workflows and merges the rest', async () => {
      const app = TestBed.createComponent(App).componentInstance;

      const failingPr = makePr({ id: 1, number: 10, workflowStatus: 'failure' });
      const goodPr = makePr({ id: 2, number: 11, workflowStatus: 'success', commits: 1, allowRebaseMerge: true });
      const group = makeGroup({ prs: [failingPr, goodPr] });
      app.prGroups.set([group]);

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, { status: 204 })
      );

      await app.approveAndMergeGroupPullRequests(group);

      const calledUrls = fetchSpy.mock.calls.map((args) => String(args[0]));
      expect(calledUrls.some((u) => u.includes(`/pulls/${failingPr.number}`))).toBe(false);
      expect(calledUrls.some((u) => u.includes(`/pulls/${goodPr.number}`))).toBe(true);
    });

    it('sets an error when all PRs have failing workflows', async () => {
      const app = TestBed.createComponent(App).componentInstance;
      const group = makeGroup({ prs: [makePr({ workflowStatus: 'failure' })] });
      app.prGroups.set([group]);

      await app.approveAndMergeGroupPullRequests(group);

      expect(app.error()).toContain('failing workflows');
    });

    it('does nothing for an empty group', async () => {
      const app = TestBed.createComponent(App).componentInstance;
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      await app.approveAndMergeGroupPullRequests(makeGroup({ prs: [] }));

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('search incomplete results (through the real provider)', () => {
    it('surfaces incompleteResults warning signal after searchAndProcessPullRequests', async () => {
      const app = TestBed.createComponent(App).componentInstance;
      app.connections.set([conn('my-org', 'ghp_test')]);

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ total_count: 1, incomplete_results: true, items: [] }), { status: 200 })
      );

      await app.searchAndProcessPullRequests();

      expect(app.incompleteResults()).toBe(true);
    });
  });

  describe('provider dispatch', () => {
    function gitlabConn(organization: string, token: string): OrgConnection {
      return { platform: 'gitlab', host: 'https://gitlab.com', organization, token };
    }

    it('routes each connection to its platform provider when searching', async () => {
      const github = { searchRenovatePrs: vi.fn().mockResolvedValue({ prs: [], incompleteResults: false }) };
      const gitlab = { searchRenovatePrs: vi.fn().mockResolvedValue({ prs: [], incompleteResults: false }) };
      TestBed.overrideProvider(GitHubProviderService, { useValue: github });
      TestBed.overrideProvider(GitLabProviderService, { useValue: gitlab });

      const app = TestBed.createComponent(App).componentInstance;
      app.connections.set([conn('gh-org', 't1'), gitlabConn('gl-group', 't2')]);

      await app.searchAndProcessPullRequests();

      expect(github.searchRenovatePrs).toHaveBeenCalledTimes(1);
      expect(github.searchRenovatePrs).toHaveBeenCalledWith(conn('gh-org', 't1'));
      expect(gitlab.searchRenovatePrs).toHaveBeenCalledTimes(1);
      expect(gitlab.searchRenovatePrs).toHaveBeenCalledWith(gitlabConn('gl-group', 't2'));
    });

    it('routes PR actions by the PR platform', async () => {
      const github = { close: vi.fn().mockResolvedValue(undefined) };
      const gitlab = { close: vi.fn().mockResolvedValue(undefined) };
      TestBed.overrideProvider(GitHubProviderService, { useValue: github });
      TestBed.overrideProvider(GitLabProviderService, { useValue: gitlab });

      const app = TestBed.createComponent(App).componentInstance;
      const gitlabPr = makePr({ id: 2, platform: 'gitlab', host: 'https://gitlab.com', uid: 'gitlab|https://gitlab.com|2' });
      app.prGroups.set([makeGroup({ prs: [gitlabPr] })]);

      await app.closePullRequest(gitlabPr);

      expect(gitlab.close).toHaveBeenCalledWith(gitlabPr);
      expect(github.close).not.toHaveBeenCalled();
    });
  });

  describe('searchAndProcessPullRequests — multi-org partial failure', () => {
    it('flags incomplete (not error) when one org fails but another succeeds', async () => {
      const provider = {
        searchRenovatePrs: vi.fn()
          .mockResolvedValueOnce({ prs: [], incompleteResults: false }) // org-a succeeds
          .mockRejectedValueOnce(new Error('org-b is down')),           // org-b fails
      };
      TestBed.overrideProvider(GitHubProviderService, { useValue: provider });

      const app = TestBed.createComponent(App).componentInstance;
      app.connections.set([
        conn('org-a', 'a'),
        conn('org-b', 'b'),
      ]);

      await app.searchAndProcessPullRequests();

      expect(app.incompleteResults()).toBe(true);
      expect(app.error()).toBeNull();
    });

    it('surfaces an error when every org fails', async () => {
      const provider = {
        searchRenovatePrs: vi.fn().mockRejectedValue(new Error('everything is down')),
      };
      TestBed.overrideProvider(GitHubProviderService, { useValue: provider });

      const app = TestBed.createComponent(App).componentInstance;
      app.connections.set([conn('org-a', 'a')]);

      await app.searchAndProcessPullRequests();

      expect(app.error()).toContain('everything is down');
    });

    it('sanitizes connections before searching, skipping malformed entries', async () => {
      const provider = {
        searchRenovatePrs: vi.fn().mockResolvedValue({ prs: [], incompleteResults: false }),
      };
      TestBed.overrideProvider(GitHubProviderService, { useValue: provider });

      const app = TestBed.createComponent(App).componentInstance;
      // A malformed entry (empty token) slips into the signal directly.
      app.connections.set([
        conn('good-org', 'ghp_good'),
        conn('bad-org', ''),
      ]);

      await app.searchAndProcessPullRequests();

      expect(provider.searchRenovatePrs).toHaveBeenCalledTimes(1);
      expect(provider.searchRenovatePrs).toHaveBeenCalledWith(conn('good-org', 'ghp_good'));
    });
  });

  describe('incomplete results banner', () => {
    it('renders the warning banner when incompleteResults is true', async () => {
      const fixture = TestBed.createComponent(App);
      const app = fixture.componentInstance;
      app.incompleteResults.set(true);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Incomplete results');
    });

    it('does not render the warning banner when incompleteResults is false', async () => {
      const fixture = TestBed.createComponent(App);
      fixture.componentInstance.incompleteResults.set(false);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).not.toContain('Incomplete results');
    });
  });

  describe('darkMode', () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => localStorage.clear());

    it('defaults to dark when no preference is stored and system prefers dark', () => {
      mockMatchMedia(true);
      const app = TestBed.createComponent(App).componentInstance;
      expect(app.darkMode()).toBe(true);
    });

    it('defaults to light when no preference is stored and system prefers light', () => {
      const app = TestBed.createComponent(App).componentInstance;
      expect(app.darkMode()).toBe(false);
    });

    it('initialises to true when localStorage has "dark"', () => {
      localStorage.setItem('theme', 'dark');
      const app = TestBed.createComponent(App).componentInstance;
      expect(app.darkMode()).toBe(true);
    });

    it('initialises to false when localStorage has "light"', () => {
      localStorage.setItem('theme', 'light');
      const app = TestBed.createComponent(App).componentInstance;
      expect(app.darkMode()).toBe(false);
    });

    it('toggleDarkMode flips the signal each call', () => {
      mockMatchMedia(true);
      const app = TestBed.createComponent(App).componentInstance;
      expect(app.darkMode()).toBe(true);

      app.toggleDarkMode();
      expect(app.darkMode()).toBe(false);

      app.toggleDarkMode();
      expect(app.darkMode()).toBe(true);
    });

    it('toggleDarkMode persists the new preference to localStorage', () => {
      const app = TestBed.createComponent(App).componentInstance;
      // No stored preference + system prefers light → starts as false (light)
      app.toggleDarkMode(); // false → true
      expect(localStorage.getItem('theme')).toBe('dark');

      app.toggleDarkMode(); // true → false
      expect(localStorage.getItem('theme')).toBe('light');
    });
  });

  describe('layout chrome', () => {
    it('shows the org name in the sidebar switcher for a single connection', () => {
      const fixture = TestBed.createComponent(App);
      fixture.componentInstance.connections.set([conn('my-org', 'ghp_test')]);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('my-org');
      expect(fixture.nativeElement.textContent).toContain('github.com');
    });

    it('shows "All organizations" in the sidebar switcher for multiple connections', () => {
      const fixture = TestBed.createComponent(App);
      fixture.componentInstance.connections.set([
        conn('org-a', 'ghp_aaa'),
        conn('org-b', 'ghp_bbb'),
      ]);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('All organizations');
    });

    it('prompts to add an organization and shows onboarding when none are configured', () => {
      const fixture = TestBed.createComponent(App);
      fixture.componentInstance.connections.set([]);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Add organization');
      expect(fixture.nativeElement.textContent).toContain('Connect an organization');
    });

    it('renders the theme toggle button with an accessible label', () => {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      const btn = fixture.nativeElement.querySelector('button[aria-label^="Switch to"]') as HTMLButtonElement;
      expect(btn?.getAttribute('aria-label')).toMatch(/switch to (light|dark) mode/i);
    });

    it('renders the refresh button, disabled without a valid connection', () => {
      const fixture = TestBed.createComponent(App);
      fixture.componentInstance.connections.set([]);
      fixture.detectChanges();
      const btn = fixture.nativeElement.querySelector('button[aria-label="Refresh pull requests"]') as HTMLButtonElement;
      expect(btn).toBeTruthy();
      expect(btn.disabled).toBe(true);
    });

    it('updates the subtitle with the configured org', () => {
      const app = TestBed.createComponent(App).componentInstance;
      app.connections.set([conn('my-org', 'ghp_test')]);
      expect(app.subtitle()).toContain('the my-org organization');

      app.connections.set([
        conn('org-a', 'a'),
        conn('org-b', 'b'),
      ]);
      expect(app.subtitle()).toContain('2 organizations');
    });
  });

  describe('auto-search and connection changes', () => {
    it('automatically searches on startup when stored connections exist', () => {
      const search = stubSearchService();
      TestBed.overrideProvider(SessionStorageService, {
        useValue: makeStorageSpy([{ organization: 'saved-org', token: 'ghp_saved' }]),
      });

      TestBed.createComponent(App);

      expect(search.searchRenovatePrs).toHaveBeenCalledWith(
        conn('saved-org', 'ghp_saved'));
    });

    it('does not search on startup when no connections are stored', () => {
      const search = stubSearchService();
      TestBed.overrideProvider(SessionStorageService, { useValue: makeStorageSpy() });

      TestBed.createComponent(App);

      expect(search.searchRenovatePrs).not.toHaveBeenCalled();
    });

    it('re-searches when a connection is added', () => {
      const search = stubSearchService();
      TestBed.overrideProvider(SessionStorageService, { useValue: makeStorageSpy() });

      const app = TestBed.createComponent(App).componentInstance;
      app.onConnectionsChange([conn('new-org', 'ghp_new')]);

      expect(search.searchRenovatePrs).toHaveBeenCalledWith(
        conn('new-org', 'ghp_new'));
    });

    it('clears results and ignores the in-flight search when the last org is removed', async () => {
      let resolveSearch!: (v: { prs: unknown[]; incompleteResults: boolean }) => void;
      const provider = {
        searchRenovatePrs: vi.fn().mockImplementation(
          () => new Promise(res => { resolveSearch = res; })),
      };
      TestBed.overrideProvider(GitHubProviderService, { useValue: provider });
      TestBed.overrideProvider(SessionStorageService, {
        useValue: makeStorageSpy([{ organization: 'my-org', token: 'ghp_test' }]),
      });

      const app = TestBed.createComponent(App).componentInstance; // auto-search starts
      expect(app.isLoading()).toBe(true);

      app.onConnectionsChange([]);
      expect(app.isLoading()).toBe(false);
      expect(app.searched()).toBe(false);

      // The stale search finishing must not resurrect any state.
      resolveSearch({ prs: [], incompleteResults: true });
      await new Promise(r => setTimeout(r));

      expect(app.prGroups()).toEqual([]);
      expect(app.incompleteResults()).toBe(false);
      expect(app.isLoading()).toBe(false);
    });

    it('discards the results of a superseded search', async () => {
      let resolveFirst!: (v: { prs: unknown[]; incompleteResults: boolean }) => void;
      const provider = {
        searchRenovatePrs: vi.fn()
          .mockImplementationOnce(() => new Promise(res => { resolveFirst = res; }))
          .mockResolvedValueOnce({ prs: [], incompleteResults: false }),
      };
      TestBed.overrideProvider(GitHubProviderService, { useValue: provider });

      const app = TestBed.createComponent(App).componentInstance;
      app.connections.set([conn('my-org', 'ghp_test')]);

      const first = app.searchAndProcessPullRequests();
      const second = app.searchAndProcessPullRequests();
      await second;

      // If applied, the stale first search would flip incompleteResults to true.
      resolveFirst({ prs: [], incompleteResults: true });
      await first;

      expect(app.incompleteResults()).toBe(false);
      expect(app.isLoading()).toBe(false);
    });
  });

  describe('per-org views', () => {
    function seedTwoOrgGroups(app: App) {
      app.connections.set([
        conn('org-a', 'a'),
        conn('org-b', 'b'),
      ]);
      app.prGroups.set([
        makeGroup({
          title: 'Update dependency foo to v2',
          prs: [
            makePr({ id: 1, repoOwner: 'org-a', workflowStatus: 'success', ciStatus: 'success' }),
            makePr({ id: 2, repoOwner: 'org-b', workflowStatus: 'failure', ciStatus: 'failure' }),
          ],
        }),
        makeGroup({
          title: 'Update dependency bar to v3',
          prs: [makePr({ id: 3, repoOwner: 'org-b', workflowStatus: 'pending', ciStatus: 'pending' })],
        }),
      ]);
    }

    it('shows all groups and PRs when no org is selected', () => {
      const app = TestBed.createComponent(App).componentInstance;
      seedTwoOrgGroups(app);

      const groups = app.visibleGroups();
      expect(groups).toHaveLength(2);
      expect(groups[0].prs).toHaveLength(2);
    });

    it('filters PRs by the selected org and drops groups left empty', () => {
      const app = TestBed.createComponent(App).componentInstance;
      seedTwoOrgGroups(app);

      app.selectedOrgKey.set(orgKey('org-a'));

      const groups = app.visibleGroups();
      expect(groups).toHaveLength(1);
      expect(groups[0].title).toBe('Update dependency foo to v2');
      expect(groups[0].prs.map(pr => pr.id)).toEqual([1]);
    });

    it('matches the selected org case-insensitively', () => {
      const app = TestBed.createComponent(App).componentInstance;
      seedTwoOrgGroups(app);

      app.selectedOrgKey.set(orgKey('ORG-A'));

      expect(app.visibleGroups()).toHaveLength(1);
    });

    it('derives group status and workflow summary from the visible PRs only', () => {
      const app = TestBed.createComponent(App).componentInstance;
      seedTwoOrgGroups(app);

      // Unfiltered, the mixed group fails; filtered to org-a it succeeds.
      expect(app.visibleGroups()[0].aggregateCiStatus).toBe('failure');
      expect(app.visibleGroups()[0].workflowSummary).toEqual({ success: 1, pending: 0, failed: 1 });

      app.selectedOrgKey.set(orgKey('org-a'));

      expect(app.visibleGroups()[0].aggregateCiStatus).toBe('success');
      expect(app.visibleGroups()[0].workflowSummary).toEqual({ success: 1, pending: 0, failed: 0 });
    });

    it('narrows visibleConnections to the selected org', () => {
      const app = TestBed.createComponent(App).componentInstance;
      seedTwoOrgGroups(app);

      expect(app.visibleConnections()).toHaveLength(2);

      app.selectedOrgKey.set(orgKey('org-b'));

      expect(app.visibleConnections()).toEqual([conn('org-b', 'b')]);
    });

    it('names the selected org in the subtitle', () => {
      const app = TestBed.createComponent(App).componentInstance;
      seedTwoOrgGroups(app);

      app.selectedOrgKey.set(orgKey('org-a'));

      expect(app.subtitle()).toContain('the org-a organization');
    });

    it('distinguishes same-named orgs on different hosts', () => {
      const app = TestBed.createComponent(App).componentInstance;
      const ghesHost = 'https://ghes.example.com';
      app.connections.set([
        conn('my-org', 'a'),
        { ...conn('my-org', 'b'), host: ghesHost },
      ]);
      app.prGroups.set([
        makeGroup({
          prs: [
            makePr({ id: 1, repoOwner: 'my-org' }), // github.com (makePr default)
            makePr({ id: 2, repoOwner: 'my-org', host: ghesHost, uid: `github|${ghesHost}|2` }),
          ],
        }),
      ]);

      app.selectedOrgKey.set(connectionKey({ platform: 'github', host: ghesHost, organization: 'my-org' }));

      const groups = app.visibleGroups();
      expect(groups).toHaveLength(1);
      expect(groups[0].prs.map(pr => pr.id)).toEqual([2]);
      expect(app.visibleConnections()).toEqual([{ ...conn('my-org', 'b'), host: ghesHost }]);
    });

    it('onSelectedOrgChange persists the selection', () => {
      const storageSpy = makeStorageSpy();
      TestBed.overrideProvider(SessionStorageService, { useValue: storageSpy });

      const app = TestBed.createComponent(App).componentInstance;

      app.onSelectedOrgChange(orgKey('org-a'));
      expect(app.selectedOrgKey()).toBe(orgKey('org-a'));
      expect(storageSpy.set).toHaveBeenCalledWith('selectedOrg', orgKey('org-a'));

      app.onSelectedOrgChange(null);
      expect(storageSpy.set).toHaveBeenCalledWith('selectedOrg', '');
    });

    it('restores a persisted selection that matches a configured org', () => {
      stubSearchService();
      const storageSpy = makeStorageSpy(
        [conn('Org-A', 'a')], '', '', 'org-a');
      TestBed.overrideProvider(SessionStorageService, { useValue: storageSpy });

      const app = TestBed.createComponent(App).componentInstance;

      // Restored with the connection's canonical casing.
      expect(app.selectedOrgKey()).toBe(orgKey('Org-A'));
    });

    it('ignores a persisted selection that no longer matches any connection', () => {
      stubSearchService();
      const storageSpy = makeStorageSpy(
        [conn('org-a', 'a')], '', '', 'gone-org');
      TestBed.overrideProvider(SessionStorageService, { useValue: storageSpy });

      const app = TestBed.createComponent(App).componentInstance;

      expect(app.selectedOrgKey()).toBeNull();
    });

    it('resets the selection when the selected org is removed', () => {
      stubSearchService();
      const storageSpy = makeStorageSpy();
      TestBed.overrideProvider(SessionStorageService, { useValue: storageSpy });

      const app = TestBed.createComponent(App).componentInstance;
      app.onConnectionsChange([
        conn('org-a', 'a'),
        conn('org-b', 'b'),
      ]);
      app.onSelectedOrgChange(orgKey('org-b'));

      app.onConnectionsChange([conn('org-a', 'a')]);

      expect(app.selectedOrgKey()).toBeNull();
    });

    it('keeps the selection when an unrelated org is removed', () => {
      stubSearchService();
      const app = TestBed.createComponent(App).componentInstance;
      app.onConnectionsChange([
        conn('org-a', 'a'),
        conn('org-b', 'b'),
      ]);
      app.onSelectedOrgChange(orgKey('org-a'));

      app.onConnectionsChange([conn('org-a', 'a')]);

      expect(app.selectedOrgKey()).toBe(orgKey('org-a'));
    });
  });

  describe('filteredGroups', () => {
    function seedGroups(app: App) {
      app.prGroups.set([
        makeGroup({
          title: 'Update dependency ruby to v3',
          prs: [
            makePr({ id: 1, repoName: 'repo-one', workflowStatus: 'failure' }),
            makePr({ id: 2, repoName: 'repo-two', workflowStatus: 'success' }),
          ],
        }),
        makeGroup({
          title: 'Update actions/checkout action to v5',
          prs: [makePr({ id: 3, repoName: 'ci-repo', workflowStatus: 'success' })],
        }),
        makeGroup({
          title: 'Update dependency zebra to v9',
          prs: [
            makePr({ id: 4, repoName: 'zoo', workflowStatus: 'pending' }),
            makePr({ id: 5, repoName: 'zoo-two', workflowStatus: 'success' }),
            makePr({ id: 6, repoName: 'zoo-three', workflowStatus: 'success' }),
          ],
        }),
      ]);
    }

    it('matches group titles case-insensitively', () => {
      const app = TestBed.createComponent(App).componentInstance;
      seedGroups(app);

      app.searchFilter.set('RUBY');

      expect(app.filteredGroups().map(g => g.title)).toEqual(['Update dependency ruby to v3']);
    });

    it('matches repositories inside groups', () => {
      const app = TestBed.createComponent(App).componentInstance;
      seedGroups(app);

      app.searchFilter.set('ci-repo');

      expect(app.filteredGroups().map(g => g.title)).toEqual(['Update actions/checkout action to v5']);
    });

    it('keeps only groups containing a PR with the selected status', () => {
      const app = TestBed.createComponent(App).componentInstance;
      seedGroups(app);

      app.statusFilter.set('failure');
      expect(app.filteredGroups().map(g => g.title)).toEqual(['Update dependency ruby to v3']);

      app.statusFilter.set('pending');
      expect(app.filteredGroups().map(g => g.title)).toEqual(['Update dependency zebra to v9']);
    });

    it('sorts by failures by default, with PR-count and name alternatives', () => {
      const app = TestBed.createComponent(App).componentInstance;
      seedGroups(app);

      expect(app.filteredGroups()[0].title).toBe('Update dependency ruby to v3'); // 1 failure

      app.sortBy.set('prs');
      expect(app.filteredGroups()[0].title).toBe('Update dependency zebra to v9'); // 3 PRs

      app.sortBy.set('name');
      expect(app.filteredGroups()[0].title).toBe('Update actions/checkout action to v5');
    });

    it('clearFilters resets search and status', () => {
      const app = TestBed.createComponent(App).componentInstance;
      seedGroups(app);
      app.searchFilter.set('nothing-matches');
      app.statusFilter.set('failure');
      expect(app.filteredGroups()).toHaveLength(0);

      app.clearFilters();

      expect(app.filteredGroups()).toHaveLength(3);
    });

    it('applies on top of the org filter', () => {
      const app = TestBed.createComponent(App).componentInstance;
      app.prGroups.set([
        makeGroup({
          title: 'Update dependency foo to v2',
          prs: [
            makePr({ id: 1, repoOwner: 'org-a', workflowStatus: 'failure' }),
            makePr({ id: 2, repoOwner: 'org-b', workflowStatus: 'failure' }),
          ],
        }),
      ]);

      app.selectedOrgKey.set(orgKey('org-b'));
      app.statusFilter.set('failure');

      const groups = app.filteredGroups();
      expect(groups).toHaveLength(1);
      expect(groups[0].prs.map(pr => pr.id)).toEqual([2]);
    });
  });

  describe('mergeAllReady', () => {
    it('approves and merges only PRs whose workflows passed', async () => {
      const app = TestBed.createComponent(App).componentInstance;
      app.prGroups.set([
        makeGroup({
          prs: [
            makePr({ id: 1, number: 10, workflowStatus: 'success', commits: 1, allowRebaseMerge: true }),
            makePr({ id: 2, number: 11, workflowStatus: 'failure' }),
            makePr({ id: 3, number: 12, workflowStatus: 'pending' }),
          ],
        }),
      ]);

      expect(app.readyToMergePrs().map(pr => pr.number)).toEqual([10]);

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
      await app.mergeAllReady();

      const calledUrls = fetchSpy.mock.calls.map(args => String(args[0]));
      expect(calledUrls.some(u => u.includes('/pulls/10/'))).toBe(true);
      expect(calledUrls.some(u => u.includes('/pulls/11/'))).toBe(false);
      expect(calledUrls.some(u => u.includes('/pulls/12/'))).toBe(false);
    });

    it('only counts PRs visible under the active org filter', () => {
      const app = TestBed.createComponent(App).componentInstance;
      app.prGroups.set([
        makeGroup({
          prs: [
            makePr({ id: 1, repoOwner: 'org-a', workflowStatus: 'success' }),
            makePr({ id: 2, repoOwner: 'org-b', workflowStatus: 'success' }),
          ],
        }),
      ]);

      expect(app.readyToMergePrs()).toHaveLength(2);

      app.selectedOrgKey.set(orgKey('org-a'));

      expect(app.readyToMergePrs()).toHaveLength(1);
      expect(app.readyToMergePrs()[0].id).toBe(1);
    });
  });

  describe('sessionStorage persistence', () => {
    it('restores connections from session storage on init', () => {
      stubSearchService();
      const saved = [conn('saved-org', 'saved-token')];
      const storageSpy = makeStorageSpy(saved);
      TestBed.overrideProvider(SessionStorageService, { useValue: storageSpy });

      const app = TestBed.createComponent(App).componentInstance;

      expect(app.connections()).toEqual(saved);
    });

    it('migrates old organization/token keys to connections on first load', () => {
      stubSearchService();
      const storageSpy = makeStorageSpy(null, 'legacy-org', 'legacy-token');
      TestBed.overrideProvider(SessionStorageService, { useValue: storageSpy });

      const app = TestBed.createComponent(App).componentInstance;

      expect(app.connections()).toEqual([conn('legacy-org', 'legacy-token')]);
      expect(storageSpy.setJson).toHaveBeenCalledWith('connections', [conn('legacy-org', 'legacy-token')]);
    });

    it('clears the legacy organization/token keys after migrating', () => {
      stubSearchService();
      const storageSpy = makeStorageSpy(null, 'legacy-org', 'legacy-token');
      TestBed.overrideProvider(SessionStorageService, { useValue: storageSpy });

      TestBed.createComponent(App);

      expect(storageSpy.remove).toHaveBeenCalledWith('organization');
      expect(storageSpy.remove).toHaveBeenCalledWith('token');
    });

    it('persists connections to session storage when onConnectionsChange is called', () => {
      stubSearchService();
      const storageSpy = makeStorageSpy();
      TestBed.overrideProvider(SessionStorageService, { useValue: storageSpy });

      const app = TestBed.createComponent(App).componentInstance;
      const newConnections = [conn('my-org', 'ghp_test')];
      app.onConnectionsChange(newConnections);

      expect(storageSpy.setJson).toHaveBeenCalledWith('connections', newConnections);
    });

    it('treats a stored empty array as authoritative and does not re-migrate legacy keys', () => {
      // User removed all orgs (connections = []) but legacy keys still linger.
      const storageSpy = makeStorageSpy([], 'legacy-org', 'legacy-token');
      TestBed.overrideProvider(SessionStorageService, { useValue: storageSpy });

      const app = TestBed.createComponent(App).componentInstance;

      expect(app.connections()).toEqual([]);
      expect(storageSpy.setJson).not.toHaveBeenCalled();
    });

    it('does not migrate when only one legacy key is present', () => {
      const storageSpy = makeStorageSpy(null, 'legacy-org', ''); // org but no token
      TestBed.overrideProvider(SessionStorageService, { useValue: storageSpy });

      const app = TestBed.createComponent(App).componentInstance;

      expect(app.connections()).toEqual([]);
      expect(storageSpy.setJson).not.toHaveBeenCalled();
    });

    it('defaults platform and host for connections stored before multi-platform support', () => {
      stubSearchService();
      // Old shape: no platform, host, or renovateAuthor.
      const storageSpy = makeStorageSpy([{ organization: 'old-org', token: 'old-token' }]);
      TestBed.overrideProvider(SessionStorageService, { useValue: storageSpy });

      const app = TestBed.createComponent(App).componentInstance;

      expect(app.connections()).toEqual([conn('old-org', 'old-token')]);
    });

    it('allows the same org name on different hosts', () => {
      stubSearchService();
      const ghes = { ...conn('my-org', 't2'), host: 'https://ghes.example.com' };
      const storageSpy = makeStorageSpy([conn('my-org', 't1'), ghes]);
      TestBed.overrideProvider(SessionStorageService, { useValue: storageSpy });

      const app = TestBed.createComponent(App).componentInstance;

      expect(app.connections()).toHaveLength(2);
    });

    it('normalizes hosts and drops entries with unparsable ones', () => {
      stubSearchService();
      const storageSpy = makeStorageSpy([
        { ...conn('org-a', 't1'), host: 'https://ghes.example.com/' }, // trailing slash
        { ...conn('org-b', 't2'), host: 'not a url' },
      ]);
      TestBed.overrideProvider(SessionStorageService, { useValue: storageSpy });

      const app = TestBed.createComponent(App).componentInstance;

      expect(app.connections()).toEqual([
        { ...conn('org-a', 't1'), host: 'https://ghes.example.com' },
      ]);
    });

    it('sanitizes stored connections: trims, drops invalid entries, and de-duplicates by org', () => {
      stubSearchService();
      const storageSpy = makeStorageSpy([
        { organization: '  org-a  ', token: '  t1  ' },
        conn('ORG-A', 't2'), // case-insensitive duplicate
        { organization: '', token: 'no-org' },   // invalid: empty org
        { organization: 'org-b', token: '' },     // invalid: empty token
      ]);
      TestBed.overrideProvider(SessionStorageService, { useValue: storageSpy });

      const app = TestBed.createComponent(App).componentInstance;

      expect(app.connections()).toEqual([conn('org-a', 't1')]);
    });

    it('sanitizes connections passed to onConnectionsChange before storing', () => {
      stubSearchService();
      const storageSpy = makeStorageSpy();
      TestBed.overrideProvider(SessionStorageService, { useValue: storageSpy });

      const app = TestBed.createComponent(App).componentInstance;
      app.onConnectionsChange([
        conn(' my-org ', ' ghp_test '),
        conn('my-org', 'dupe'),
      ]);

      expect(app.connections()).toEqual([conn('my-org', 'ghp_test')]);
      expect(storageSpy.setJson).toHaveBeenCalledWith('connections', [conn('my-org', 'ghp_test')]);
    });
  });
});
