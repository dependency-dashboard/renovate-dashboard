import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { GitProvider } from './git-provider';
import { GitHubProviderService } from './github-provider.service';
import { GitLabProviderService } from './gitlab-provider.service';
import { connectionKey, OrgConnection, prConnectionKey, PullRequest } from '../models/pull-request.model';

/**
 * Behavioral contract every GitProvider implementation must satisfy, run
 * against each provider with platform-appropriate fetch fixtures. This keeps
 * the implementations from drifting apart on the invariants app.ts relies on.
 */
interface ProviderContract {
  name: string;
  providerType: new (...args: never[]) => GitProvider;
  connection: OrgConnection;
  /** One search response body containing exactly one result item. */
  searchBody: unknown;
  /** A PR of this platform, as if returned by searchRenovatePrs. */
  makePr(): PullRequest;
}

const CONTRACTS: ProviderContract[] = [
  {
    name: 'GitHubProviderService',
    providerType: GitHubProviderService,
    connection: { platform: 'github', host: 'https://github.com', organization: 'my-org', token: 'tok' },
    searchBody: {
      total_count: 1,
      incomplete_results: false,
      items: [{
        id: 11,
        number: 5,
        title: 'Update dependency foo to v2',
        repository_url: 'https://api.github.com/repos/my-org/repo',
        html_url: 'https://github.com/my-org/repo/pull/5',
        user: { login: 'renovate[bot]', avatar_url: '' },
        created_at: '2024-01-01T00:00:00Z',
        labels: [],
      }],
    },
    makePr: () => ({
      id: 11, uid: 'github|https://github.com|11', platform: 'github', host: 'https://github.com',
      number: 5, title: 'Update dependency foo to v2', html_url: 'https://github.com/my-org/repo/pull/5',
      user: { login: 'renovate[bot]', avatar_url: '' }, created_at: '2024-01-01T00:00:00Z', labels: [],
      repoOwner: 'my-org', repoName: 'repo', head: { sha: 'abc' }, isModified: false,
      ciStatus: 'unknown', checkRuns: [], isProcessing: false, workflowStatus: 'unknown',
      orgToken: 'tok', commits: 1, allowMergeCommit: true,
    }),
  },
  {
    name: 'GitLabProviderService',
    providerType: GitLabProviderService,
    connection: { platform: 'gitlab', host: 'https://gitlab.com', organization: 'my-org', token: 'tok' },
    searchBody: [{
      id: 11,
      iid: 5,
      project_id: 42,
      title: 'Update dependency foo to v2',
      web_url: 'https://gitlab.com/my-org/repo/-/merge_requests/5',
      created_at: '2024-01-01T00:00:00Z',
      sha: 'abc',
      author: { username: 'renovate-bot', avatar_url: null },
    }],
    makePr: () => ({
      id: 11, uid: 'gitlab|https://gitlab.com|11', platform: 'gitlab', host: 'https://gitlab.com',
      projectId: 42, number: 5, title: 'Update dependency foo to v2',
      html_url: 'https://gitlab.com/my-org/repo/-/merge_requests/5',
      user: { login: 'renovate-bot', avatar_url: '' }, created_at: '2024-01-01T00:00:00Z', labels: [],
      repoOwner: 'my-org', repoName: 'repo', head: { sha: 'abc' }, isModified: false,
      ciStatus: 'unknown', checkRuns: [], isProcessing: false, workflowStatus: 'unknown',
      orgToken: 'tok', commits: 1,
    }),
  },
];

for (const contract of CONTRACTS) {
  describe(`GitProvider contract: ${contract.name}`, () => {
    let provider: GitProvider;

    beforeEach(() => {
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
      provider = TestBed.inject(contract.providerType);
    });

    afterEach(() => vi.restoreAllMocks());

    it('search returns normalized PRs matching the connection identity', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(contract.searchBody), { status: 200 }));

      const result = await provider.searchRenovatePrs(contract.connection);

      expect(typeof result.incompleteResults).toBe('boolean');
      expect(result.prs).toHaveLength(1);
      const pr = result.prs[0];
      expect(pr.platform).toBe(contract.connection.platform);
      expect(pr.host).toBe(contract.connection.host);
      expect(pr.uid).toBe(`${pr.platform}|${pr.host}|${pr.id}`);
      expect(pr.orgToken).toBe(contract.connection.token);
      expect(pr.title.length).toBeGreaterThan(0);
      expect(pr.number).toBeGreaterThan(0);
      // The org filter must be able to match this PR back to its connection.
      expect(prConnectionKey(pr)).toBe(connectionKey(contract.connection));
    });

    it('search requests only touch the connection host', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(contract.searchBody), { status: 200 }));

      await provider.searchRenovatePrs(contract.connection);

      const expectedOrigin = contract.connection.host === 'https://github.com'
        ? 'https://api.github.com'
        : contract.connection.host;
      for (const call of fetchSpy.mock.calls) {
        expect(String(call[0]).startsWith(expectedOrigin)).toBe(true);
      }
    });

    it('search propagates failures as errors', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }));

      await expect(provider.searchRenovatePrs(contract.connection)).rejects.toThrow();
    });

    it('fetchPrDetails never throws and degrades statuses to unknown on failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

      const pr = contract.makePr();
      pr.ciStatus = 'success';
      pr.workflowStatus = 'success';
      await provider.fetchPrDetails(pr);

      expect(pr.ciStatus).toBe('unknown');
      expect(pr.workflowStatus).toBe('unknown');
      expect(pr.checkRuns).toEqual([]);
    });

    it('approveAndMerge rejects when the merge fails', async () => {
      // First call (approve) succeeds, second (merge) fails.
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response('{}', { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'merge blocked' }), { status: 405 }));

      await expect(provider.approveAndMerge(contract.makePr())).rejects.toThrow();
    });

    it('close resolves and only touches the PR host', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));

      await provider.close(contract.makePr());

      expect(fetchSpy).toHaveBeenCalled();
      const expectedOrigin = contract.connection.host === 'https://github.com'
        ? 'https://api.github.com'
        : contract.connection.host;
      expect(String(fetchSpy.mock.calls[0][0]).startsWith(expectedOrigin)).toBe(true);
    });
  });
}
