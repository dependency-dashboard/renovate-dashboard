import { OrgConnection, PullRequest } from '../models/pull-request.model';

export interface ProviderSearchResult {
  prs: PullRequest[];
  incompleteResults: boolean;
}

/**
 * Platform-agnostic operations the dashboard needs from a git host.
 *
 * Implementations translate their platform's API shapes into the shared
 * PullRequest model so the rest of the app never sees platform specifics.
 * GitHubProviderService is the only implementation today; a GitLab one is
 * planned (#81 phase 3).
 */
export interface GitProvider {
  /**
   * Find all open Renovate pull requests for one connection, normalized but
   * without CI details (head SHA, statuses, and check runs arrive via
   * fetchPrDetails).
   */
  searchRenovatePrs(connection: OrgConnection): Promise<ProviderSearchResult>;

  /**
   * Populate CI status, check runs, commit count, and merge settings on the
   * PR in place. Never throws — on failure the PR's statuses stay 'unknown'.
   */
  fetchPrDetails(pr: PullRequest): Promise<void>;

  /** Approve the PR, then merge it with a platform-appropriate method. Throws on failure. */
  approveAndMerge(pr: PullRequest): Promise<void>;

  /** Close the PR without merging. Throws on failure. */
  close(pr: PullRequest): Promise<void>;
}
