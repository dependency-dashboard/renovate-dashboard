import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PrGroupComponent } from './pr-group.component';
import { PrGroup, PullRequest } from '../../models/pull-request.model';

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

describe('PrGroupComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PrGroupComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(PrGroupComponent);
    fixture.componentRef.setInput('group', makeGroup());
    expect(fixture.componentInstance).toBeTruthy();
  });

  describe('computed properties', () => {
    it('isGroupProcessing is true when any PR is processing', () => {
      const fixture = TestBed.createComponent(PrGroupComponent);
      fixture.componentRef.setInput('group', makeGroup({
        prs: [makePr({ isProcessing: true }), makePr({ id: 2, isProcessing: false })],
      }));
      expect(fixture.componentInstance.isGroupProcessing()).toBe(true);
    });

    it('isGroupProcessing is false when no PRs are processing', () => {
      const fixture = TestBed.createComponent(PrGroupComponent);
      fixture.componentRef.setInput('group', makeGroup({
        prs: [makePr({ isProcessing: false })],
      }));
      expect(fixture.componentInstance.isGroupProcessing()).toBe(false);
    });

    it('hasFailingWorkflows is true when any PR has a failing workflow', () => {
      const fixture = TestBed.createComponent(PrGroupComponent);
      fixture.componentRef.setInput('group', makeGroup({
        prs: [makePr({ workflowStatus: 'failure' })],
      }));
      expect(fixture.componentInstance.hasFailingWorkflows()).toBe(true);
    });

    it('isGroupMergeDisabled is true when any PR is processing', () => {
      const fixture = TestBed.createComponent(PrGroupComponent);
      fixture.componentRef.setInput('group', makeGroup({
        prs: [makePr({ isProcessing: true })],
      }));
      expect(fixture.componentInstance.isGroupMergeDisabled()).toBe(true);
    });

    it('isGroupMergeDisabled is true when any PR has a failing workflow', () => {
      const fixture = TestBed.createComponent(PrGroupComponent);
      fixture.componentRef.setInput('group', makeGroup({
        prs: [makePr({ workflowStatus: 'failure' })],
      }));
      expect(fixture.componentInstance.isGroupMergeDisabled()).toBe(true);
    });

    it('isGroupMergeDisabled is false when all PRs are idle with passing workflows', () => {
      const fixture = TestBed.createComponent(PrGroupComponent);
      fixture.componentRef.setInput('group', makeGroup({
        prs: [makePr({ isProcessing: false, workflowStatus: 'success' })],
      }));
      expect(fixture.componentInstance.isGroupMergeDisabled()).toBe(false);
    });
  });

  describe('outputs', () => {
    it('emits toggleGroup when the header button is clicked', () => {
      const fixture = TestBed.createComponent(PrGroupComponent);
      const group = makeGroup({ prs: [makePr()] });
      fixture.componentRef.setInput('group', group);
      fixture.detectChanges();

      const emitted: PrGroup[] = [];
      fixture.componentInstance.toggleGroup.subscribe((g: PrGroup) => emitted.push(g));

      const headerBtn = findButtonByText(fixture.nativeElement, group.title);
      headerBtn.click();

      expect(emitted).toHaveLength(1);
      expect(emitted[0].title).toBe(group.title);
    });

    it('emits closeGroupPrs when Close All is clicked', () => {
      const fixture = TestBed.createComponent(PrGroupComponent);
      const group = makeGroup({ prs: [makePr()] });
      fixture.componentRef.setInput('group', group);
      fixture.detectChanges();

      const emitted: PrGroup[] = [];
      fixture.componentInstance.closeGroupPrs.subscribe((g: PrGroup) => emitted.push(g));

      const closeAllBtn = findButtonByText(fixture.nativeElement, 'Close All');
      closeAllBtn.click();

      expect(emitted).toHaveLength(1);
    });

    it('emits approveAndMergeGroupPrs when Approve & Merge All is clicked', () => {
      const fixture = TestBed.createComponent(PrGroupComponent);
      const group = makeGroup({ prs: [makePr({ workflowStatus: 'success' })] });
      fixture.componentRef.setInput('group', group);
      fixture.detectChanges();

      const emitted: PrGroup[] = [];
      fixture.componentInstance.approveAndMergeGroupPrs.subscribe((g: PrGroup) => emitted.push(g));

      const mergeAllBtn = findButtonByText(fixture.nativeElement, 'Approve & Merge All');
      mergeAllBtn.click();

      expect(emitted).toHaveLength(1);
    });
  });

  describe('aria-labels', () => {
    it('Close All button has an aria-label identifying the group', () => {
      const fixture = TestBed.createComponent(PrGroupComponent);
      const group = makeGroup({ title: 'Update lodash', prs: [makePr()] });
      fixture.componentRef.setInput('group', group);
      fixture.detectChanges();

      const closeAllBtn = findButtonByText(fixture.nativeElement, 'Close All');
      expect(closeAllBtn.getAttribute('aria-label')).toBe('Close all PRs in group: Update lodash');
    });

    it('Approve & Merge All button has an aria-label identifying the group', () => {
      const fixture = TestBed.createComponent(PrGroupComponent);
      const group = makeGroup({ title: 'Update lodash', prs: [makePr({ workflowStatus: 'success' })] });
      fixture.componentRef.setInput('group', group);
      fixture.detectChanges();

      const mergeAllBtn = findButtonByText(fixture.nativeElement, 'Approve & Merge All');
      expect(mergeAllBtn.getAttribute('aria-label')).toBe('Approve and merge all PRs in group: Update lodash');
    });
  });

  describe('group refresh', () => {
    it('emits refreshGroup when the refresh button is clicked', () => {
      const fixture = TestBed.createComponent(PrGroupComponent);
      const group = makeGroup({ prs: [makePr()] });
      fixture.componentRef.setInput('group', group);
      fixture.detectChanges();

      const emitted: PrGroup[] = [];
      fixture.componentInstance.refreshGroup.subscribe((g: PrGroup) => emitted.push(g));

      const btn = fixture.nativeElement.querySelector('[aria-label^="Refresh statuses"]') as HTMLButtonElement;
      btn.click();

      expect(emitted).toEqual([group]);
    });

    it('disables the refresh button and spins while refreshing', () => {
      const fixture = TestBed.createComponent(PrGroupComponent);
      fixture.componentRef.setInput('group', makeGroup({ prs: [makePr()] }));
      fixture.componentRef.setInput('refreshing', true);
      fixture.detectChanges();

      const btn = fixture.nativeElement.querySelector('[aria-label^="Refresh statuses"]') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
      expect(btn.querySelector('svg')?.classList.contains('animate-spin')).toBe(true);
    });
  });
});
