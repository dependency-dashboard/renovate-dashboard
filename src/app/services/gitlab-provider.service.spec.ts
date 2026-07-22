import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { GitLabProviderService } from './gitlab-provider.service';
import { OrgConnection, PullRequest } from '../models/pull-request.model';

const CONNECTION: OrgConnection = {
  platform: 'gitlab',
  host: 'https://gitlab.com',
  organization: 'my-group',
  token: 'glpat-test',
};

function makeMr(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    iid: id * 10,
    project_id: 42,
    title: 'Update dependency foo to v2',
    web_url: `https://gitlab.com/my-group/sub/project/-/merge_requests/${id * 10}`,
    created_at: '2024-01-01T00:00:00Z',
    sha: 'sha-1',
    author: { username: 'renovate-bot', avatar_url: null },
    ...overrides,
  };
}

function makeMrPr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: 1,
    uid: 'gitlab|https://gitlab.com|1',
    platform: 'gitlab',
    host: 'https://gitlab.com',
    projectId: 42,
    number: 10,
    title: 'Update dependency foo to v2',
    html_url: 'https://gitlab.com/my-group/project/-/merge_requests/10',
    user: { login: 'renovate-bot', avatar_url: '' },
    created_at: '2024-01-01T00:00:00Z',
    labels: [],
    repoOwner: 'my-group',
    repoName: 'project',
    head: { sha: 'sha-1' },
    isModified: false,
    ciStatus: 'unknown',
    checkRuns: [],
    isProcessing: false,
    workflowStatus: 'unknown',
    orgToken: 'glpat-test',
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe('GitLabProviderService', () => {
  let provider: GitLabProviderService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    provider = TestBed.inject(GitLabProviderService);
  });

  afterEach(() => vi.restoreAllMocks());

  describe('searchRenovatePrs', () => {
    it('queries the group merge_requests API with subgroups and the default author', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse([]));

      await provider.searchRenovatePrs(CONNECTION);

      const [url, init] = fetchSpy.mock.calls[0];
      expect(String(url)).toContain('https://gitlab.com/api/v4/groups/my-group/merge_requests');
      expect(String(url)).toContain('state=opened');
      expect(String(url)).toContain('author_username=renovate-bot');
      expect(String(url)).toContain('include_subgroups=true');
      expect(String(url)).toContain('scope=all');
      expect((init as RequestInit).headers).toMatchObject({ 'PRIVATE-TOKEN': 'glpat-test' });
    });

    it('uses a per-connection author and URL-encodes nested group paths', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse([]));

      await provider.searchRenovatePrs({
        ...CONNECTION,
        organization: 'parent/child',
        renovateAuthor: 'my-renovate',
      });

      const url = String(fetchSpy.mock.calls[0][0]);
      expect(url).toContain('/groups/parent%2Fchild/merge_requests');
      expect(url).toContain('author_username=my-renovate');
    });

    it('normalizes MRs: uid, iid as number, projectId, and repo path from the web URL', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse([makeMr(7)]));

      const { prs, incompleteResults } = await provider.searchRenovatePrs(CONNECTION);

      expect(incompleteResults).toBe(false);
      expect(prs).toHaveLength(1);
      expect(prs[0]).toMatchObject({
        id: 7,
        uid: 'gitlab|https://gitlab.com|7',
        platform: 'gitlab',
        host: 'https://gitlab.com',
        projectId: 42,
        number: 70,
        repoOwner: 'my-group',
        repoName: 'sub/project',
        orgToken: 'glpat-test',
      });
    });

    it('paginates until a short page', async () => {
      const fullPage = Array.from({ length: 100 }, (_, i) => makeMr(i + 1));
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(jsonResponse(fullPage))
        .mockResolvedValueOnce(jsonResponse([makeMr(101)]));

      const { prs, incompleteResults } = await provider.searchRenovatePrs(CONNECTION);

      expect(prs).toHaveLength(101);
      expect(incompleteResults).toBe(false);
    });

    it('caps at 10 pages and flags incomplete results', async () => {
      const fullPage = Array.from({ length: 100 }, (_, i) => makeMr(i + 1));
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(jsonResponse(fullPage)));

      const { prs, incompleteResults } = await provider.searchRenovatePrs(CONNECTION);

      expect(fetchSpy).toHaveBeenCalledTimes(10);
      expect(prs).toHaveLength(1000);
      expect(incompleteResults).toBe(true);
    });

    it('surfaces GitLab error messages', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        jsonResponse({ message: '401 Unauthorized' }, 401));

      await expect(provider.searchRenovatePrs(CONNECTION)).rejects.toThrow('401 Unauthorized');
    });
  });

  describe('fetchPrDetails', () => {
    it('derives CI status from the head pipeline and maps jobs to check runs', async () => {
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(jsonResponse(makeMr(1, { head_pipeline: { id: 9, status: 'failed' } })))
        .mockResolvedValueOnce(jsonResponse([{}, {}])) // 2 commits
        .mockResolvedValueOnce(jsonResponse([
          { id: 1, name: 'build', status: 'success', web_url: 'https://gitlab.com/j/1' },
          { id: 2, name: 'test', status: 'failed', web_url: 'https://gitlab.com/j/2' },
          { id: 3, name: 'deploy', status: 'manual', web_url: 'https://gitlab.com/j/3' },
          { id: 4, name: 'lint', status: 'running', web_url: 'https://gitlab.com/j/4' },
        ]));

      const pr = makeMrPr();
      await provider.fetchPrDetails(pr);

      expect(pr.ciStatus).toBe('failure');
      expect(pr.workflowStatus).toBe('failure');
      expect(pr.commits).toBe(2);
      expect(pr.isModified).toBe(true);
      expect(pr.checkRuns).toEqual([
        { id: 1, name: 'build', status: 'completed', conclusion: 'success', html_url: 'https://gitlab.com/j/1' },
        { id: 2, name: 'test', status: 'completed', conclusion: 'failure', html_url: 'https://gitlab.com/j/2' },
        { id: 3, name: 'deploy', status: 'completed', conclusion: 'neutral', html_url: 'https://gitlab.com/j/3' },
        { id: 4, name: 'lint', status: 'in_progress', conclusion: null, html_url: 'https://gitlab.com/j/4' },
      ]);
    });

    it('maps pipeline statuses: running→pending, success→success, no pipeline→unknown', async () => {
      const cases: [string | undefined, string][] = [
        ['running', 'pending'],
        ['created', 'pending'],
        ['success', 'success'],
        ['skipped', 'success'],
        ['canceled', 'failure'],
        [undefined, 'unknown'],
      ];

      for (const [pipelineStatus, expected] of cases) {
        vi.restoreAllMocks();
        const fetchSpy = vi.spyOn(globalThis, 'fetch')
          .mockResolvedValueOnce(jsonResponse(makeMr(1, {
            head_pipeline: pipelineStatus ? { id: 9, status: pipelineStatus } : null,
          })))
          .mockResolvedValueOnce(jsonResponse([{}]))
          .mockResolvedValue(jsonResponse([]));

        const pr = makeMrPr();
        await provider.fetchPrDetails(pr);

        expect(pr.ciStatus, `pipeline status ${pipelineStatus}`).toBe(expected);
        void fetchSpy;
      }
    });

    it('leaves statuses unknown and never throws when a request fails', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

      const pr = makeMrPr({ ciStatus: 'success', workflowStatus: 'success' });
      await provider.fetchPrDetails(pr);

      expect(pr.ciStatus).toBe('unknown');
      expect(pr.workflowStatus).toBe('unknown');
      expect(pr.checkRuns).toEqual([]);
    });
  });

  describe('approveAndMerge', () => {
    it('approves then merges, squashing multi-commit MRs', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(jsonResponse({})));

      await provider.approveAndMerge(makeMrPr({ commits: 3 }));

      const calls = fetchSpy.mock.calls;
      expect(String(calls[0][0])).toBe('https://gitlab.com/api/v4/projects/42/merge_requests/10/approve');
      expect(String(calls[1][0])).toBe('https://gitlab.com/api/v4/projects/42/merge_requests/10/merge');
      expect((calls[1][1] as RequestInit).method).toBe('PUT');
      expect((calls[1][1] as RequestInit).body).toContain('"squash":true');
    });

    it('does not squash single-commit MRs', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(jsonResponse({})));

      await provider.approveAndMerge(makeMrPr({ commits: 1 }));

      expect((fetchSpy.mock.calls[1][1] as RequestInit).body).toContain('"squash":false');
    });

    it('merges anyway when approval is unavailable (Premium-only endpoint)', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(jsonResponse({ message: '404 Not Found' }, 404))
        .mockResolvedValueOnce(jsonResponse({}));

      await provider.approveAndMerge(makeMrPr());

      expect(String(fetchSpy.mock.calls[1][0])).toContain('/merge');
    });

    it('propagates non-authorization approval failures without merging', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(jsonResponse({ message: 'server exploded' }, 500));

      await expect(provider.approveAndMerge(makeMrPr())).rejects.toThrow('server exploded');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('propagates merge failures', async () => {
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(jsonResponse({})) // approve ok
        .mockResolvedValueOnce(jsonResponse({ message: 'Branch cannot be merged' }, 406));

      await expect(provider.approveAndMerge(makeMrPr())).rejects.toThrow('Branch cannot be merged');
    });
  });

  describe('close', () => {
    it('closes the MR with a state_event', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(jsonResponse({})));

      await provider.close(makeMrPr());

      const [url, init] = fetchSpy.mock.calls[0];
      expect(String(url)).toBe('https://gitlab.com/api/v4/projects/42/merge_requests/10');
      expect((init as RequestInit).method).toBe('PUT');
      expect((init as RequestInit).body).toContain('close');
    });
  });
});
