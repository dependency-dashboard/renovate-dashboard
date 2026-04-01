import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PrItemComponent } from './pr-item.component';
import { PullRequest } from '../../models/pull-request.model';

function makePr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: 1,
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

      const closeBtn = fixture.nativeElement.querySelector('button.bg-red-800') as HTMLButtonElement;
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

      const mergeBtn = fixture.nativeElement.querySelector('button.bg-green-800') as HTMLButtonElement;
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
});
