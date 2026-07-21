import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { OverviewPanelComponent } from './overview-panel.component';
import { PrGroup, PullRequest } from '../../models/pull-request.model';

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

function makeGroup(prs: PullRequest[], title = 'Update dependency foo to v2'): PrGroup {
  return {
    title,
    prs,
    aggregateCiStatus: 'unknown',
    isExpanded: false,
    workflowSummary: { success: 0, pending: 0, failed: 0 },
  };
}

describe('OverviewPanelComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OverviewPanelComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('shows zeros with no groups', () => {
    const fixture = TestBed.createComponent(OverviewPanelComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.stats()).toEqual({ total: 0, passed: 0, running: 0, failing: 0 });
  });

  it('counts PRs across all groups by workflow status', () => {
    const fixture = TestBed.createComponent(OverviewPanelComponent);
    fixture.componentRef.setInput('groups', [
      makeGroup([
        makePr({ id: 1, workflowStatus: 'success' }),
        makePr({ id: 2, workflowStatus: 'failure' }),
      ]),
      makeGroup([
        makePr({ id: 3, workflowStatus: 'success' }),
        makePr({ id: 4, workflowStatus: 'pending' }),
        makePr({ id: 5, workflowStatus: 'unknown' }),
      ], 'Update dependency bar to v3'),
    ]);
    fixture.detectChanges();

    // Unknown statuses count toward the total but no status tile.
    expect(fixture.componentInstance.stats()).toEqual({ total: 5, passed: 2, running: 1, failing: 1 });
  });

  it('renders a tile per stat with the computed values', () => {
    const fixture = TestBed.createComponent(OverviewPanelComponent);
    fixture.componentRef.setInput('groups', [
      makeGroup([
        makePr({ id: 1, workflowStatus: 'success' }),
        makePr({ id: 2, workflowStatus: 'failure' }),
      ]),
    ]);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Total PRs');
    expect(text).toContain('Passed');
    expect(text).toContain('Running CI');
    expect(text).toContain('Failing');

    const values = Array.from(fixture.nativeElement.querySelectorAll('.tabular-nums'))
      .map(el => (el as HTMLElement).textContent?.trim());
    expect(values).toEqual(['2', '1', '0', '1']);
  });
});
