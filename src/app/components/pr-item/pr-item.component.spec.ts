import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PrItemComponent } from './pr-item.component';
import { PullRequest } from '../../models/pull-request.model';

function findButtonByText(nativeElement: HTMLElement, text: string): HTMLButtonElement {
  return Array.from(nativeElement.querySelectorAll('button'))
    .find((btn) => btn.textContent?.trim() === text) as HTMLButtonElement;
}

function makePr(overrides: Partial<PullRequest> = {}): PullRequest {
  const id = overrides.id ?? 1;
  return {
    id,
    uid: `github|https://github.com|${id}`,
    platform: 'github',
    host: 'https://github.com',
    number: 42,
    title: 'Update dependency foo to v2',
    html_url: 'https://github.com/org/repo/pull/42',
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

describe('PrItemComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PrItemComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(PrItemComponent);
    fixture.componentRef.setInput('pr', makePr());
    expect(fixture.componentInstance).toBeTruthy();
  });

  describe('isMergeDisabled', () => {
    it('is false when PR is not processing and workflow is not failing', () => {
      const fixture = TestBed.createComponent(PrItemComponent);
      fixture.componentRef.setInput('pr', makePr({ isProcessing: false, workflowStatus: 'success' }));
      expect(fixture.componentInstance.isMergeDisabled).toBe(false);
    });

    it('is true when PR is processing', () => {
      const fixture = TestBed.createComponent(PrItemComponent);
      fixture.componentRef.setInput('pr', makePr({ isProcessing: true, workflowStatus: 'success' }));
      expect(fixture.componentInstance.isMergeDisabled).toBe(true);
    });

    it('is true when workflow status is failure', () => {
      const fixture = TestBed.createComponent(PrItemComponent);
      fixture.componentRef.setInput('pr', makePr({ isProcessing: false, workflowStatus: 'failure' }));
      expect(fixture.componentInstance.isMergeDisabled).toBe(true);
    });
  });

  describe('outputs', () => {
    it('emits closePr with the PR when Close is clicked', () => {
      const fixture = TestBed.createComponent(PrItemComponent);
      const pr = makePr({ isProcessing: false });
      fixture.componentRef.setInput('pr', pr);
      fixture.detectChanges();

      const emitted: PullRequest[] = [];
      fixture.componentInstance.closePr.subscribe((v: PullRequest) => emitted.push(v));

      const closeBtn = findButtonByText(fixture.nativeElement, 'Close');
      closeBtn.click();

      expect(emitted).toHaveLength(1);
      expect(emitted[0].id).toBe(pr.id);
    });

    it('emits approveAndMergePr with the PR when Approve & Merge is clicked', () => {
      const fixture = TestBed.createComponent(PrItemComponent);
      const pr = makePr({ isProcessing: false, workflowStatus: 'success' });
      fixture.componentRef.setInput('pr', pr);
      fixture.detectChanges();

      const emitted: PullRequest[] = [];
      fixture.componentInstance.approveAndMergePr.subscribe((v: PullRequest) => emitted.push(v));

      const mergeBtn = findButtonByText(fixture.nativeElement, 'Approve & Merge');
      mergeBtn.click();

      expect(emitted).toHaveLength(1);
      expect(emitted[0].id).toBe(pr.id);
    });

    it('emits toggleExpanded when the expand button is clicked', () => {
      const fixture = TestBed.createComponent(PrItemComponent);
      fixture.componentRef.setInput('pr', makePr());
      fixture.detectChanges();

      let emitted = false;
      fixture.componentInstance.toggleExpanded.subscribe(() => { emitted = true; });

      const toggleBtn = fixture.nativeElement.querySelector('button[type="button"]') as HTMLButtonElement;
      toggleBtn.click();

      expect(emitted).toBe(true);
    });
  });

  describe('aria-labels', () => {
    it('Close button has an aria-label identifying the PR', () => {
      const fixture = TestBed.createComponent(PrItemComponent);
      fixture.componentRef.setInput('pr', makePr({ repoOwner: 'test-org', repoName: 'test-repo', number: 42 }));
      fixture.detectChanges();

      const closeBtn = findButtonByText(fixture.nativeElement, 'Close');
      expect(closeBtn.getAttribute('aria-label')).toBe('Close PR test-org/test-repo#42');
    });

    it('Approve & Merge button has an aria-label identifying the PR', () => {
      const fixture = TestBed.createComponent(PrItemComponent);
      fixture.componentRef.setInput('pr', makePr({ repoOwner: 'test-org', repoName: 'test-repo', number: 42, workflowStatus: 'success' }));
      fixture.detectChanges();

      const mergeBtn = findButtonByText(fixture.nativeElement, 'Approve & Merge');
      expect(mergeBtn.getAttribute('aria-label')).toBe('Approve and merge PR test-org/test-repo#42');
    });
  });

  describe('formatConclusion', () => {
    it('formats snake_case conclusions to Title Case', () => {
      const fixture = TestBed.createComponent(PrItemComponent);
      fixture.componentRef.setInput('pr', makePr());
      expect(fixture.componentInstance.formatConclusion('timed_out')).toBe('Timed Out');
      expect(fixture.componentInstance.formatConclusion('action_required')).toBe('Action Required');
    });

    it('returns Pending for null conclusion', () => {
      const fixture = TestBed.createComponent(PrItemComponent);
      fixture.componentRef.setInput('pr', makePr());
      expect(fixture.componentInstance.formatConclusion(null)).toBe('Pending');
    });
  });

  describe('prRef', () => {
    it('formats GitHub PRs with # and GitLab MRs with !', () => {
      const fixture = TestBed.createComponent(PrItemComponent);

      fixture.componentRef.setInput('pr', makePr());
      fixture.detectChanges();
      expect(fixture.componentInstance.prRef()).toBe('test-org/test-repo#42');
      expect(fixture.nativeElement.textContent).toContain('test-org/test-repo#42');

      fixture.componentRef.setInput('pr', makePr({
        platform: 'gitlab', host: 'https://gitlab.com', uid: 'gitlab|https://gitlab.com|1',
      }));
      fixture.detectChanges();
      expect(fixture.componentInstance.prRef()).toBe('test-org/test-repo!42');
      expect(fixture.nativeElement.textContent).toContain('test-org/test-repo!42');
    });
  });

  describe('checks progress', () => {
    function makeCheck(id: number, conclusion: 'success' | 'failure' | 'skipped' | 'neutral' | null) {
      return { id, name: `check-${id}`, status: 'completed' as const, conclusion, html_url: '' };
    }

    it('counts success, skipped, and neutral conclusions as passed', () => {
      const fixture = TestBed.createComponent(PrItemComponent);
      fixture.componentRef.setInput('pr', makePr({
        checkRuns: [
          makeCheck(1, 'success'),
          makeCheck(2, 'skipped'),
          makeCheck(3, 'neutral'),
          makeCheck(4, 'failure'),
          makeCheck(5, null),
        ],
      }));

      expect(fixture.componentInstance.checksPassed()).toBe(3);
      expect(fixture.componentInstance.checksTotal()).toBe(5);
      expect(fixture.componentInstance.checksPct()).toBe(60);
    });

    it('renders the passed/total counter when checks exist and hides it otherwise', () => {
      const fixture = TestBed.createComponent(PrItemComponent);
      fixture.componentRef.setInput('pr', makePr({
        workflowStatus: 'failure',
        checkRuns: [makeCheck(1, 'success'), makeCheck(2, 'failure')],
      }));
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('1/2');
      expect(fixture.nativeElement.querySelector('[title*="checks passed"]')).not.toBeNull();

      fixture.componentRef.setInput('pr', makePr({ checkRuns: [] }));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[title*="checks passed"]')).toBeNull();
    });
  });

  describe('age', () => {
    it('formats the PR age compactly', () => {
      const fixture = TestBed.createComponent(PrItemComponent);

      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      fixture.componentRef.setInput('pr', makePr({ created_at: twoHoursAgo }));
      expect(fixture.componentInstance.age()).toBe('2h');

      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      fixture.componentRef.setInput('pr', makePr({ created_at: threeDaysAgo }));
      expect(fixture.componentInstance.age()).toBe('3d');
    });

    it('returns an empty string for an unparsable date', () => {
      const fixture = TestBed.createComponent(PrItemComponent);
      fixture.componentRef.setInput('pr', makePr({ created_at: 'not-a-date' }));
      expect(fixture.componentInstance.age()).toBe('');
    });
  });
});
