import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { GitHubProviderService } from './github-provider.service';
import { OrgConnection, PullRequest } from '../models/pull-request.model';

const CONNECTION: OrgConnection = {
  platform: 'github',
  host: 'https://github.com',
  organization: 'my-org',
  token: 'ghp_test',
};

interface ProviderPrivate {
  determineMergeMethod(pr: PullRequest): string;
  apiRequest<T>(url: string, token: string, method?: string, body?: object): Promise<T>;
}

function makeItem(id: number, repo = 'repo') {
  return {
    id,
    number: id,
    title: 'Update dependency foo to v2',
    repository_url: `https://api.github.com/repos/my-org/${repo}`,
    html_url: `https://github.com/my-org/${repo}/pull/${id}`,
    user: { login: 'renovate[bot]', avatar_url: '' },
    created_at: '2024-01-01T00:00:00Z',
    labels: [],
  };
}

function searchResponse(items: object[], opts: { total_count?: number; incomplete_results?: boolean } = {}) {
  return new Response(
    JSON.stringify({ total_count: opts.total_count ?? items.length, incomplete_results: opts.incomplete_results ?? false, items }),
    { status: 200 }
  );
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
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
    html_url: 'https://github.com/my-org/repo/pull/1',
    user: { login: 'renovate[bot]', avatar_url: '' },
    created_at: '2024-01-01T00:00:00Z',
    labels: [],
    repoOwner: 'my-org',
    repoName: 'repo',
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

describe('GitHubProviderService', () => {
  let provider: GitHubProviderService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    provider = TestBed.inject(GitHubProviderService);
  });

  afterEach(() => vi.restoreAllMocks());

  describe('searchRenovatePrs', () => {
    it('queries open Renovate PRs scoped to the connection org', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(searchResponse([]));

      await provider.searchRenovatePrs(CONNECTION);

      const calledUrl = String(fetchSpy.mock.calls[0][0]);
      expect(calledUrl).toContain('https://api.github.com/search/issues');
      // URLSearchParams encodes spaces as +, colons as %3A
      expect(calledUrl).toContain('is%3Apr+author%3Aapp%2Frenovate+org%3Amy-org+is%3Aopen');
    });

    it('normalizes search items into PullRequests with the connection token', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(searchResponse([makeItem(7, 'my-repo')]));

      const { prs } = await provider.searchRenovatePrs(CONNECTION);

      expect(prs).toHaveLength(1);
      expect(prs[0]).toMatchObject({
        id: 7,
        uid: 'github|https://github.com|7',
        platform: 'github',
        host: 'https://github.com',
        number: 7,
        repoOwner: 'my-org',
        repoName: 'my-repo',
        orgToken: 'ghp_test',
        ciStatus: 'unknown',
        workflowStatus: 'unknown',
        isProcessing: false,
      });
    });

    it('uses a per-connection Renovate author when configured', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(searchResponse([]));

      await provider.searchRenovatePrs({ ...CONNECTION, renovateAuthor: 'renovate-bot' });

      const calledUrl = String(fetchSpy.mock.calls[0][0]);
      expect(calledUrl).toContain('author%3Arenovate-bot');
      expect(calledUrl).not.toContain('app%2Frenovate');
    });

    it('fetches all items across multiple pages', async () => {
      const page1Items = Array.from({ length: 100 }, (_, i) => makeItem(i + 1));
      const page2Items = [makeItem(101)];

      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(searchResponse(page1Items, { total_count: 101 }))
        .mockResolvedValueOnce(searchResponse(page2Items, { total_count: 101 }));

      const { prs, incompleteResults } = await provider.searchRenovatePrs(CONNECTION);

      expect(prs).toHaveLength(101);
      expect(incompleteResults).toBe(false);
    });

    it('sets incompleteResults when the API reports incomplete_results', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        searchResponse([makeItem(1)], { incomplete_results: true })
      );

      const { incompleteResults } = await provider.searchRenovatePrs(CONNECTION);

      expect(incompleteResults).toBe(true);
    });

    it('continues fetching when incomplete_results is true but fewer than per_page items were returned', async () => {
      // GitHub can return < 100 items with incomplete_results: true while total_count is still higher.
      const shortPage = Array.from({ length: 50 }, (_, i) => makeItem(i + 1));
      const finalPage = [makeItem(51)];

      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(searchResponse(shortPage, { total_count: 51, incomplete_results: true }))
        .mockResolvedValueOnce(searchResponse(finalPage, { total_count: 51, incomplete_results: true }));

      const { prs, incompleteResults } = await provider.searchRenovatePrs(CONNECTION);

      expect(prs).toHaveLength(51);
      expect(incompleteResults).toBe(true);
    });

    it('caps at 10 pages and sets incompleteResults when total_count exceeds 1000', async () => {
      const fullPage = Array.from({ length: 100 }, (_, i) => makeItem(i + 1));
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(searchResponse(fullPage, { total_count: 2000 }))
      );

      const { prs, incompleteResults } = await provider.searchRenovatePrs(CONNECTION);

      expect(fetchSpy).toHaveBeenCalledTimes(10);
      expect(prs).toHaveLength(1000);
      expect(incompleteResults).toBe(true);
    });

    it('throws with status and statusText on non-ok response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 403, statusText: 'Forbidden' }));

      await expect(provider.searchRenovatePrs(CONNECTION)).rejects.toThrow('GitHub search failed: 403 Forbidden');
    });

    it('uses the JSON error message when the body contains one', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401, statusText: 'Unauthorized' })
      );

      await expect(provider.searchRenovatePrs(CONNECTION)).rejects.toThrow('Bad credentials');
    });
  });

  describe('fetchPrDetails', () => {
    function detailResponses(overrides: {
      commits?: number;
      checkRuns?: object[];
      combinedState?: string;
    } = {}) {
      return [
        jsonResponse({ commits: overrides.commits ?? 1, head: { sha: 'sha-1' } }),
        jsonResponse({ allow_squash_merge: true, allow_merge_commit: true, allow_rebase_merge: true }),
        jsonResponse({ state: overrides.combinedState ?? 'pending' }),
        jsonResponse({ total_count: (overrides.checkRuns ?? []).length, check_runs: overrides.checkRuns ?? [] }),
      ];
    }

    it('populates head SHA, commit count, merge settings, and check runs', async () => {
      const responses = detailResponses({
        commits: 3,
        checkRuns: [
          { id: 1, name: 'ci', status: 'completed', conclusion: 'success', html_url: '' },
        ],
      });
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      responses.forEach(r => fetchSpy.mockResolvedValueOnce(r));

      const pr = makePr();
      await provider.fetchPrDetails(pr);

      expect(pr.head.sha).toBe('sha-1');
      expect(pr.commits).toBe(3);
      expect(pr.isModified).toBe(true);
      expect(pr.allowSquashMerge).toBe(true);
      expect(pr.checkRuns).toHaveLength(1);
      expect(pr.ciStatus).toBe('success');
      expect(pr.workflowStatus).toBe('success');
    });

    it('marks failure when any check run failed', async () => {
      const responses = detailResponses({
        checkRuns: [
          { id: 1, name: 'a', status: 'completed', conclusion: 'success', html_url: '' },
          { id: 2, name: 'b', status: 'completed', conclusion: 'failure', html_url: '' },
        ],
      });
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      responses.forEach(r => fetchSpy.mockResolvedValueOnce(r));

      const pr = makePr();
      await provider.fetchPrDetails(pr);

      expect(pr.ciStatus).toBe('failure');
      expect(pr.workflowStatus).toBe('failure');
    });

    it('falls back to the combined status when there are no check runs', async () => {
      const responses = detailResponses({ combinedState: 'success', checkRuns: [] });
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      responses.forEach(r => fetchSpy.mockResolvedValueOnce(r));

      const pr = makePr();
      await provider.fetchPrDetails(pr);

      expect(pr.ciStatus).toBe('success');
      expect(pr.workflowStatus).toBe('success');
    });

    it('leaves statuses unknown and never throws when a request fails', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

      const pr = makePr({ ciStatus: 'success', workflowStatus: 'success' });
      await provider.fetchPrDetails(pr);

      expect(pr.ciStatus).toBe('unknown');
      expect(pr.workflowStatus).toBe('unknown');
      expect(pr.checkRuns).toEqual([]);
    });
  });

  describe('repo settings cache', () => {
    function routeFetch(counters: { repo: number }) {
      return vi.spyOn(globalThis, 'fetch').mockImplementation(url => {
        const u = String(url);
        if (/\/repos\/[^/]+\/[^/]+$/.test(u)) {
          counters.repo++;
          return Promise.resolve(jsonResponse({ allow_squash_merge: true, allow_merge_commit: true, allow_rebase_merge: true }));
        }
        if (u.includes('/pulls/')) {
          return Promise.resolve(jsonResponse({ commits: 1, head: { sha: 'sha-1' } }));
        }
        if (u.includes('/status')) {
          return Promise.resolve(jsonResponse({ state: 'success' }));
        }
        return Promise.resolve(jsonResponse({ total_count: 0, check_runs: [] }));
      });
    }

    it('fetches repo settings once per repository across PRs', async () => {
      const counters = { repo: 0 };
      routeFetch(counters);

      await provider.fetchPrDetails(makePr({ id: 1, number: 1 }));
      await provider.fetchPrDetails(makePr({ id: 2, number: 2 }));
      await provider.fetchPrDetails(makePr({ id: 3, number: 3, repoName: 'other-repo' }));

      expect(counters.repo).toBe(2); // once for repo, once for other-repo
    });

    it('does not cache failed settings fetches', async () => {
      let calls = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(url => {
        const u = String(url);
        if (/\/repos\/[^/]+\/[^/]+$/.test(u)) {
          calls++;
          return calls === 1
            ? Promise.resolve(new Response('{}', { status: 500 }))
            : Promise.resolve(jsonResponse({ allow_squash_merge: true, allow_merge_commit: true, allow_rebase_merge: true }));
        }
        if (u.includes('/pulls/')) {
          return Promise.resolve(jsonResponse({ commits: 1, head: { sha: 'sha-1' } }));
        }
        if (u.includes('/status')) {
          return Promise.resolve(jsonResponse({ state: 'success' }));
        }
        return Promise.resolve(jsonResponse({ total_count: 0, check_runs: [] }));
      });

      const first = makePr({ id: 1, number: 1 });
      await provider.fetchPrDetails(first); // settings fetch fails → statuses unknown
      expect(first.ciStatus).toBe('unknown');

      const second = makePr({ id: 2, number: 2 });
      await provider.fetchPrDetails(second); // retried, not served from cache
      expect(calls).toBe(2);
      expect(second.allowSquashMerge).toBe(true);
    });
  });

  describe('approveAndMerge', () => {
    it('approves and then merges with the determined method', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));

      await provider.approveAndMerge(makePr({ number: 5, commits: 1, allowRebaseMerge: true }));

      const calls = fetchSpy.mock.calls;
      expect(String(calls[0][0])).toContain('/pulls/5/reviews');
      expect((calls[0][1] as RequestInit).body).toContain('APPROVE');
      expect(String(calls[1][0])).toContain('/pulls/5/merge');
      expect((calls[1][1] as RequestInit).body).toContain('"merge_method":"rebase"');
    });

    it('propagates approval failures without attempting the merge', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Review not allowed' }), { status: 422 })
      );

      await expect(provider.approveAndMerge(makePr({ allowMergeCommit: true }))).rejects.toThrow('Review not allowed');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('close', () => {
    it('closes the PR with a PATCH', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));

      await provider.close(makePr({ number: 9 }));

      const [url, init] = fetchSpy.mock.calls[0];
      expect(String(url)).toContain('/pulls/9');
      expect((init as RequestInit).method).toBe('PATCH');
      expect((init as RequestInit).body).toContain('closed');
    });
  });

  describe('GitHub Enterprise Server hosts', () => {
    const GHES: OrgConnection = { ...CONNECTION, host: 'https://ghes.example.com' };

    it('searches under <host>/api/v3', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(searchResponse([]));

      await provider.searchRenovatePrs(GHES);

      expect(String(fetchSpy.mock.calls[0][0])).toContain('https://ghes.example.com/api/v3/search/issues');
    });

    it('derives PR uid and host from the connection', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(searchResponse([makeItem(3)]));

      const { prs } = await provider.searchRenovatePrs(GHES);

      expect(prs[0].host).toBe('https://ghes.example.com');
      expect(prs[0].uid).toBe('github|https://ghes.example.com|3');
    });

    it('issues detail and action requests against the PR host', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
      const pr = makePr({ host: 'https://ghes.example.com', number: 4, allowMergeCommit: true });

      await provider.close(pr);
      await provider.approveAndMerge(pr);

      const urls = fetchSpy.mock.calls.map(args => String(args[0]));
      expect(urls[0]).toBe('https://ghes.example.com/api/v3/repos/my-org/repo/pulls/4');
      expect(urls[1]).toContain('https://ghes.example.com/api/v3/repos/my-org/repo/pulls/4/reviews');
      expect(urls.every(u => !u.includes('api.github.com'))).toBe(true);
    });
  });

  describe('determineMergeMethod', () => {
    it('uses rebase for a single-commit PR when rebase is allowed', () => {
      const pr = makePr({ commits: 1, allowRebaseMerge: true, allowSquashMerge: true });
      expect((provider as unknown as ProviderPrivate).determineMergeMethod(pr)).toBe('rebase');
    });

    it('uses squash for a multi-commit PR when squash is allowed', () => {
      const pr = makePr({ commits: 3, allowSquashMerge: true, allowRebaseMerge: true });
      expect((provider as unknown as ProviderPrivate).determineMergeMethod(pr)).toBe('squash');
    });

    it('falls back to merge when squash is not allowed for multi-commit PR', () => {
      const pr = makePr({ commits: 3, allowSquashMerge: false, allowMergeCommit: true });
      expect((provider as unknown as ProviderPrivate).determineMergeMethod(pr)).toBe('merge');
    });

    it('throws when no merge method is available', () => {
      const pr = makePr({ commits: 1, allowRebaseMerge: false, allowSquashMerge: false, allowMergeCommit: false });
      expect(() => (provider as unknown as ProviderPrivate).determineMergeMethod(pr)).toThrow('No suitable merge method available');
    });
  });

  describe('apiRequest error handling', () => {
    it('throws with the API error message on non-ok response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 })
      );

      await expect((provider as unknown as ProviderPrivate).apiRequest('https://api.github.com/test', 'ghp_test')).rejects.toThrow('Bad credentials');
    });

    it('falls back to status message when error body is not JSON', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('<html>Bad Gateway</html>', { status: 502, statusText: 'Bad Gateway' })
      );

      await expect((provider as unknown as ProviderPrivate).apiRequest('https://api.github.com/test', 'ghp_test')).rejects.toThrow('API request failed with status: 502 Bad Gateway');
    });

    it('returns undefined for 204 No Content responses', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(null, { status: 204 })
      );

      const result = await (provider as unknown as ProviderPrivate).apiRequest('https://api.github.com/test', 'ghp_test', 'PUT');
      expect(result).toBeUndefined();
    });
  });
});
