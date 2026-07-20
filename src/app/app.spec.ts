import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { App } from './app';
import { getSourceRepositoryUrl } from './config/source-repository-url';
import { PullRequest, PrGroup } from './models/pull-request.model';
import { SessionStorageService } from './services/session-storage.service';
import { GitHubSearchService } from './services/github-search.service';

interface AppPrivate {
  determineMergeMethod(pr: PullRequest): string;
  apiRequest<T>(url: string, token: string, method?: string, body?: object): Promise<T>;
}

function makePr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: 1,
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
    mockMatchMedia(false);
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  afterEach(() => vi.restoreAllMocks());

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

  it('should render the title as an h1', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const h1 = fixture.nativeElement.querySelector('h1');
    expect(h1).toBeTruthy();
    expect(h1!.textContent?.trim()).toContain('Renovate Dashboard');
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
      app.connections.set([{ organization: 'my-org', token: 'ghp_token' }]);
      expect(app.formValid()).toBe(true);
    });

    it('is true when multiple connections are configured', () => {
      const app = TestBed.createComponent(App).componentInstance;
      app.connections.set([
        { organization: 'org-a', token: 'ghp_aaa' },
        { organization: 'org-b', token: 'ghp_bbb' },
      ]);
      expect(app.formValid()).toBe(true);
    });

    it('is false when the only connection has an empty token', () => {
      const app = TestBed.createComponent(App).componentInstance;
      app.connections.set([{ organization: 'my-org', token: '' }]);
      expect(app.formValid()).toBe(false);
    });

    it('is false when the only connection has a whitespace-only org', () => {
      const app = TestBed.createComponent(App).componentInstance;
      app.connections.set([{ organization: '   ', token: 'ghp_token' }]);
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

  describe('determineMergeMethod', () => {
    it('uses rebase for a single-commit PR when rebase is allowed', () => {
      const app = TestBed.createComponent(App).componentInstance;
      const pr = makePr({ commits: 1, allowRebaseMerge: true, allowSquashMerge: true });
      expect((app as unknown as AppPrivate).determineMergeMethod(pr)).toBe('rebase');
    });

    it('uses squash for a multi-commit PR when squash is allowed', () => {
      const app = TestBed.createComponent(App).componentInstance;
      const pr = makePr({ commits: 3, allowSquashMerge: true, allowRebaseMerge: true });
      expect((app as unknown as AppPrivate).determineMergeMethod(pr)).toBe('squash');
    });

    it('falls back to merge when squash is not allowed for multi-commit PR', () => {
      const app = TestBed.createComponent(App).componentInstance;
      const pr = makePr({ commits: 3, allowSquashMerge: false, allowMergeCommit: true });
      expect((app as unknown as AppPrivate).determineMergeMethod(pr)).toBe('merge');
    });

    it('throws when no merge method is available', () => {
      const app = TestBed.createComponent(App).componentInstance;
      const pr = makePr({ commits: 1, allowRebaseMerge: false, allowSquashMerge: false, allowMergeCommit: false });
      expect(() => (app as unknown as AppPrivate).determineMergeMethod(pr)).toThrow('No suitable merge method available');
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
      app.expandedPrIds.set(new Set([42]));

      app.removePrFromGroup(pr);

      expect(app.expandedPrIds().has(42)).toBe(false);
    });
  });

  describe('toggleGroup', () => {
    it('expands a collapsed group', () => {
      const app = TestBed.createComponent(App).componentInstance;
      const group = makeGroup({ isExpanded: false });
      app.prGroups.set([group]);

      app.toggleGroup(group);

      expect(app.prGroups()[0].isExpanded).toBe(true);
    });

    it('collapses an expanded group and clears its PR ids from expandedPrIds', () => {
      const app = TestBed.createComponent(App).componentInstance;
      const pr = makePr({ id: 7 });
      const group = makeGroup({ prs: [pr], isExpanded: true });
      app.prGroups.set([group]);
      app.expandedPrIds.set(new Set([7]));

      app.toggleGroup(group);

      expect(app.prGroups()[0].isExpanded).toBe(false);
      expect(app.expandedPrIds().has(7)).toBe(false);
    });
  });

  describe('togglePullRequest', () => {
    it('adds the PR id to expandedPrIds when not present', () => {
      const app = TestBed.createComponent(App).componentInstance;
      app.togglePullRequest(makePr({ id: 5 }));
      expect(app.expandedPrIds().has(5)).toBe(true);
    });

    it('removes the PR id from expandedPrIds when already present', () => {
      const app = TestBed.createComponent(App).componentInstance;
      app.expandedPrIds.set(new Set([5]));
      app.togglePullRequest(makePr({ id: 5 }));
      expect(app.expandedPrIds().has(5)).toBe(false);
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

  describe('fetchAllSearchItems / pagination', () => {
    it('surfaces incompleteResults warning signal after searchAndProcessPullRequests', async () => {
      const app = TestBed.createComponent(App).componentInstance;
      app.connections.set([{ organization: 'my-org', token: 'ghp_test' }]);

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ total_count: 1, incomplete_results: true, items: [] }), { status: 200 })
      );

      await app.searchAndProcessPullRequests();

      expect(app.incompleteResults()).toBe(true);
    });
  });

  describe('searchAndProcessPullRequests — multi-org partial failure', () => {
    it('flags incomplete (not error) when one org fails but another succeeds', async () => {
      const search = {
        fetchAllSearchItems: vi.fn()
          .mockResolvedValueOnce({ items: [], incompleteResults: false }) // org-a succeeds
          .mockRejectedValueOnce(new Error('org-b is down')),             // org-b fails
      };
      TestBed.overrideProvider(GitHubSearchService, { useValue: search });

      const app = TestBed.createComponent(App).componentInstance;
      app.connections.set([
        { organization: 'org-a', token: 'a' },
        { organization: 'org-b', token: 'b' },
      ]);

      await app.searchAndProcessPullRequests();

      expect(app.incompleteResults()).toBe(true);
      expect(app.error()).toBeNull();
    });

    it('surfaces an error when every org fails', async () => {
      const search = {
        fetchAllSearchItems: vi.fn().mockRejectedValue(new Error('everything is down')),
      };
      TestBed.overrideProvider(GitHubSearchService, { useValue: search });

      const app = TestBed.createComponent(App).componentInstance;
      app.connections.set([{ organization: 'org-a', token: 'a' }]);

      await app.searchAndProcessPullRequests();

      expect(app.error()).toContain('everything is down');
    });
  });

  describe('apiRequest error handling', () => {
    it('throws with the API error message on non-ok response', async () => {
      const app = TestBed.createComponent(App).componentInstance;

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 })
      );

      await expect((app as unknown as AppPrivate).apiRequest('https://api.github.com/test', 'ghp_test')).rejects.toThrow('Bad credentials');
    });

    it('falls back to status message when error body is not JSON', async () => {
      const app = TestBed.createComponent(App).componentInstance;

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('<html>Bad Gateway</html>', { status: 502, statusText: 'Bad Gateway' })
      );

      await expect((app as unknown as AppPrivate).apiRequest('https://api.github.com/test', 'ghp_test')).rejects.toThrow('API request failed with status: 502 Bad Gateway');
    });

    it('returns undefined for 204 No Content responses', async () => {
      const app = TestBed.createComponent(App).componentInstance;

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(null, { status: 204 })
      );

      const result = await (app as unknown as AppPrivate).apiRequest('https://api.github.com/test', 'ghp_test', 'PUT');
      expect(result).toBeUndefined();
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

  describe('top bar', () => {
    it('shows org name in chip for a single connection', () => {
      const fixture = TestBed.createComponent(App);
      fixture.componentInstance.connections.set([{ organization: 'my-org', token: 'ghp_test' }]);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('github.com / my-org');
    });

    it('shows org count in chip for multiple connections', () => {
      const fixture = TestBed.createComponent(App);
      fixture.componentInstance.connections.set([
        { organization: 'org-a', token: 'ghp_aaa' },
        { organization: 'org-b', token: 'ghp_bbb' },
      ]);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('github.com · 2 orgs');
    });

    it('hides the connection chip when no connections are configured', () => {
      const fixture = TestBed.createComponent(App);
      fixture.componentInstance.connections.set([]);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).not.toContain('github.com');
    });

    it('renders the theme toggle button with an accessible label', () => {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      const btn = fixture.nativeElement.querySelector('button[aria-label]') as HTMLButtonElement;
      expect(btn?.getAttribute('aria-label')).toMatch(/switch to (light|dark) mode/i);
    });
  });

  describe('sessionStorage persistence', () => {
    function makeStorageSpy(connectionsValue: unknown = null, orgValue = '', tokenValue = '') {
      return {
        get: vi.fn((key: string) => key === 'organization' ? orgValue : tokenValue),
        set: vi.fn(),
        getJson: vi.fn((key: string) => key === 'connections' ? connectionsValue : null),
        setJson: vi.fn(),
      };
    }

    it('restores connections from session storage on init', () => {
      const saved = [{ organization: 'saved-org', token: 'saved-token' }];
      const storageSpy = makeStorageSpy(saved);
      TestBed.overrideProvider(SessionStorageService, { useValue: storageSpy });

      const app = TestBed.createComponent(App).componentInstance;

      expect(app.connections()).toEqual(saved);
    });

    it('migrates old organization/token keys to connections on first load', () => {
      const storageSpy = makeStorageSpy(null, 'legacy-org', 'legacy-token');
      TestBed.overrideProvider(SessionStorageService, { useValue: storageSpy });

      const app = TestBed.createComponent(App).componentInstance;

      expect(app.connections()).toEqual([{ organization: 'legacy-org', token: 'legacy-token' }]);
      expect(storageSpy.setJson).toHaveBeenCalledWith('connections', [{ organization: 'legacy-org', token: 'legacy-token' }]);
    });

    it('persists connections to session storage when onConnectionsChange is called', () => {
      const storageSpy = makeStorageSpy();
      TestBed.overrideProvider(SessionStorageService, { useValue: storageSpy });

      const app = TestBed.createComponent(App).componentInstance;
      const newConnections = [{ organization: 'my-org', token: 'ghp_test' }];
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

    it('sanitizes stored connections: trims, drops invalid entries, and de-duplicates by org', () => {
      const storageSpy = makeStorageSpy([
        { organization: '  org-a  ', token: '  t1  ' },
        { organization: 'ORG-A', token: 't2' }, // case-insensitive duplicate
        { organization: '', token: 'no-org' },   // invalid: empty org
        { organization: 'org-b', token: '' },     // invalid: empty token
      ]);
      TestBed.overrideProvider(SessionStorageService, { useValue: storageSpy });

      const app = TestBed.createComponent(App).componentInstance;

      expect(app.connections()).toEqual([{ organization: 'org-a', token: 't1' }]);
    });

    it('sanitizes connections passed to onConnectionsChange before storing', () => {
      const storageSpy = makeStorageSpy();
      TestBed.overrideProvider(SessionStorageService, { useValue: storageSpy });

      const app = TestBed.createComponent(App).componentInstance;
      app.onConnectionsChange([
        { organization: ' my-org ', token: ' ghp_test ' },
        { organization: 'my-org', token: 'dupe' },
      ]);

      expect(app.connections()).toEqual([{ organization: 'my-org', token: 'ghp_test' }]);
      expect(storageSpy.setJson).toHaveBeenCalledWith('connections', [{ organization: 'my-org', token: 'ghp_test' }]);
    });
  });
});
