import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { App } from './app';
import { getSourceRepositoryUrl } from './config/source-repository-url';
import { PullRequest, PrGroup } from './models/pull-request.model';
import { SessionStorageService } from './services/session-storage.service';

interface AppPrivate {
  determineMergeMethod(pr: PullRequest): string;
  apiRequest<T>(url: string, method?: string, body?: object): Promise<T>;
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

describe('App', () => {
  beforeEach(async () => {
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
    expect(compiled.querySelector('h1')?.textContent).toContain('Renovate PR Dashboard');
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
    it('is false when both fields are empty', () => {
      const app = TestBed.createComponent(App).componentInstance;
      expect(app.formValid()).toBe(false);
    });

    it('is false when only organization is set', () => {
      const app = TestBed.createComponent(App).componentInstance;
      app.organization.set('my-org');
      expect(app.formValid()).toBe(false);
    });

    it('is false when only token is set', () => {
      const app = TestBed.createComponent(App).componentInstance;
      app.token.set('ghp_token');
      expect(app.formValid()).toBe(false);
    });

    it('is false when fields are only whitespace', () => {
      const app = TestBed.createComponent(App).componentInstance;
      app.organization.set('   ');
      app.token.set('   ');
      expect(app.formValid()).toBe(false);
    });

    it('is true when both organization and token are non-empty', () => {
      const app = TestBed.createComponent(App).componentInstance;
      app.organization.set('my-org');
      app.token.set('ghp_token');
      expect(app.formValid()).toBe(true);
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
      app.organization.set('test-org');
      app.token.set('ghp_test');

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
      app.organization.set('my-org');
      app.token.set('ghp_test');

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ total_count: 1, incomplete_results: true, items: [] }), { status: 200 })
      );

      await app.searchAndProcessPullRequests();

      expect(app.incompleteResults()).toBe(true);
    });
  });

  describe('apiRequest error handling', () => {
    it('throws with the API error message on non-ok response', async () => {
      const app = TestBed.createComponent(App).componentInstance;
      app.token.set('ghp_test');

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 })
      );

      await expect((app as unknown as AppPrivate).apiRequest('https://api.github.com/test')).rejects.toThrow('Bad credentials');
    });

    it('falls back to status message when error body is not JSON', async () => {
      const app = TestBed.createComponent(App).componentInstance;
      app.token.set('ghp_test');

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('<html>Bad Gateway</html>', { status: 502, statusText: 'Bad Gateway' })
      );

      await expect((app as unknown as AppPrivate).apiRequest('https://api.github.com/test')).rejects.toThrow('API request failed with status: 502 Bad Gateway');
    });

    it('returns undefined for 204 No Content responses', async () => {
      const app = TestBed.createComponent(App).componentInstance;
      app.token.set('ghp_test');

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(null, { status: 204 })
      );

      const result = await (app as unknown as AppPrivate).apiRequest('https://api.github.com/test', 'PUT');
      expect(result).toBeUndefined();
    });
  });

  describe('sessionStorage persistence', () => {
    it('restores organization and token from session storage on init', () => {
      const storageSpy = { get: vi.fn((key: string) => key === 'organization' ? 'saved-org' : 'saved-token'), set: vi.fn() };
      TestBed.overrideProvider(SessionStorageService, { useValue: storageSpy });

      const app = TestBed.createComponent(App).componentInstance;

      expect(app.organization()).toBe('saved-org');
      expect(app.token()).toBe('saved-token');
    });

    it('persists organization and token to session storage on search', async () => {
      const storageSpy = { get: vi.fn(() => ''), set: vi.fn() };
      TestBed.overrideProvider(SessionStorageService, { useValue: storageSpy });

      const app = TestBed.createComponent(App).componentInstance;
      app.organization.set('my-org');
      app.token.set('ghp_test');

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ total_count: 0, incomplete_results: false, items: [] }), { status: 200 })
      );

      await app.searchAndProcessPullRequests();

      expect(storageSpy.set).toHaveBeenCalledWith('organization', 'my-org');
      expect(storageSpy.set).toHaveBeenCalledWith('token', 'ghp_test');
    });

    it('trims whitespace from organization and token before persisting and searching', async () => {
      const storageSpy = { get: vi.fn(() => ''), set: vi.fn() };
      TestBed.overrideProvider(SessionStorageService, { useValue: storageSpy });

      const app = TestBed.createComponent(App).componentInstance;
      app.organization.set('  my-org  ');
      app.token.set('  ghp_test  ');

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ total_count: 0, incomplete_results: false, items: [] }), { status: 200 })
      );

      await app.searchAndProcessPullRequests();

      expect(app.organization()).toBe('my-org');
      expect(app.token()).toBe('ghp_test');
      expect(storageSpy.set).toHaveBeenCalledWith('organization', 'my-org');
      expect(storageSpy.set).toHaveBeenCalledWith('token', 'ghp_test');
    });
  });
});
