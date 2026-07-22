export type CiStatus = 'success' | 'failure' | 'pending' | 'unknown';

export type Platform = 'github' | 'gitlab';

export const DEFAULT_GITHUB_HOST = 'https://github.com';
export const DEFAULT_GITLAB_HOST = 'https://gitlab.com';

export function defaultHostFor(platform: Platform): string {
  return platform === 'gitlab' ? DEFAULT_GITLAB_HOST : DEFAULT_GITHUB_HOST;
}

export interface OrgConnection {
  platform: Platform;
  /** Origin URL of the instance, e.g. 'https://github.com' or 'https://ghes.example.com'. */
  host: string;
  organization: string;
  token: string;
  /** Search author for Renovate PRs; provider default (e.g. 'app/renovate') when unset. */
  renovateAuthor?: string;
}

/**
 * Normalize a user-supplied host to an http(s) origin. An empty value means
 * "the platform's default host"; an unparsable or non-http(s) value returns null.
 */
export function normalizeHost(raw: string, defaultHost: string = DEFAULT_GITHUB_HOST): string | null {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) {
    return defaultHost;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Canonical identity of a connection: the same org name can exist on
 * different hosts/platforms, so identity is the triple, org compared
 * case-insensitively.
 */
export function connectionKey(c: Pick<OrgConnection, 'platform' | 'host' | 'organization'>): string {
  return `${c.platform}|${c.host}|${c.organization.toLowerCase()}`;
}

/** The connection key of the connection a PR was fetched through. */
export function prConnectionKey(pr: Pick<PullRequest, 'platform' | 'host' | 'repoOwner'>): string {
  return `${pr.platform}|${pr.host}|${pr.repoOwner.toLowerCase()}`;
}

export interface GitHubUser {
  login: string;
  avatar_url: string;
}

export interface GitHubLabel {
  id: number;
  node_id: string;
  url: string;
  name: string;
  color: string;
  description: string | null;
  default: boolean;
}

export interface CheckRun {
  id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null;
  html_url: string;
}

export interface GitHubIssueSearchItem {
  id: number;
  number: number;
  title: string;
  html_url: string;
  repository_url: string;
  user: GitHubUser;
  created_at: string;
  labels: GitHubLabel[];
}

export interface GitHubSearchIssuesResponse {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubIssueSearchItem[];
}

export interface GitHubPullRequestDetails {
  commits: number;
  head: { sha: string };
}

export interface GitHubRepository {
  allow_squash_merge: boolean;
  allow_merge_commit: boolean;
  allow_rebase_merge: boolean;
}

export interface GitHubCheckRunsResponse {
  total_count: number;
  check_runs: CheckRun[];
}

export interface GitHubCombinedStatusResponse {
  state: 'success' | 'failure' | 'pending' | 'error';
}

export interface PullRequest {
  id: number;
  /**
   * Globally unique key for UI tracking (expansion state, removal). Numeric
   * ids are only unique within one instance, so providers derive this from
   * platform + host + id.
   */
  uid: string;
  /** Platform and host of the connection this PR was fetched through. */
  platform: Platform;
  host: string;
  /** GitLab only: the project id, required by every project-scoped API call. */
  projectId?: number;
  number: number;
  title: string;
  html_url: string;
  user: GitHubUser;
  created_at: string;
  labels: GitHubLabel[];
  repoOwner: string;
  repoName: string;
  head: { sha: string };
  isModified: boolean;
  ciStatus: CiStatus;
  checkRuns: CheckRun[];
  isProcessing: boolean; // For button loading states
  workflowStatus: CiStatus;
  orgToken: string; // Token for the org that owns this PR's repository
  commits?: number; // Number of commits in the PR
  allowSquashMerge?: boolean;
  allowMergeCommit?: boolean;
  allowRebaseMerge?: boolean;
}

/** Raw grouped search results: PRs sharing a Renovate title, across all orgs. */
export interface PrGroupData {
  title: string;
  prs: PullRequest[];
}

/**
 * View model consumed by PrGroupComponent: a (possibly org-filtered) group
 * with its display state derived from the visible PRs.
 */
export interface PrGroup extends PrGroupData {
  aggregateCiStatus: 'success' | 'failure' | 'pending' | 'mixed' | 'unknown';
  isExpanded: boolean;
  workflowSummary: { success: number; pending: number; failed: number };
}
