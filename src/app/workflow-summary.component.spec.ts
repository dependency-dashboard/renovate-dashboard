import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { WorkflowSummaryComponent } from './workflow-summary.component';
import { WorkflowSummaryService, WorkflowSummary } from './workflow-summary.service';
import { OrgConnection } from './models/pull-request.model';

const CONNECTIONS: OrgConnection[] = [{ organization: 'my-org', token: 'ghp_test' }];

describe('WorkflowSummaryComponent', () => {
  let summaryServiceSpy: { getSummary: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    summaryServiceSpy = { getSummary: vi.fn().mockResolvedValue({ success: 3, pending: 1, failed: 2 }) };

    await TestBed.configureTestingModule({
      imports: [WorkflowSummaryComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: WorkflowSummaryService, useValue: summaryServiceSpy },
      ],
    }).compileComponents();
  });

  it('should create with default summary', () => {
    const fixture = TestBed.createComponent(WorkflowSummaryComponent);
    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.componentInstance.summary()).toEqual({ success: 0, pending: 0, failed: 0 });
  });

  it('does not load when refreshTrigger is 0', async () => {
    const fixture = TestBed.createComponent(WorkflowSummaryComponent);
    fixture.componentRef.setInput('connections', CONNECTIONS);
    fixture.componentRef.setInput('refreshTrigger', 0);
    TestBed.flushEffects();

    expect(summaryServiceSpy.getSummary).not.toHaveBeenCalled();
  });

  it('does not load when connections list is empty', async () => {
    const fixture = TestBed.createComponent(WorkflowSummaryComponent);
    fixture.componentRef.setInput('connections', []);
    fixture.componentRef.setInput('refreshTrigger', 1);
    TestBed.flushEffects();

    expect(summaryServiceSpy.getSummary).not.toHaveBeenCalled();
  });

  it('loads summary when connections and refreshTrigger > 0 are provided', async () => {
    const fixture = TestBed.createComponent(WorkflowSummaryComponent);
    fixture.componentRef.setInput('connections', CONNECTIONS);
    fixture.componentRef.setInput('refreshTrigger', 1);
    TestBed.flushEffects();

    expect(summaryServiceSpy.getSummary).toHaveBeenCalledWith(CONNECTIONS);
  });

  it('updates summary signal after successful load', async () => {
    const fixture = TestBed.createComponent(WorkflowSummaryComponent);
    fixture.componentRef.setInput('connections', CONNECTIONS);
    fixture.componentRef.setInput('refreshTrigger', 1);
    TestBed.flushEffects();

    await summaryServiceSpy.getSummary.mock.results[0].value;

    expect(fixture.componentInstance.summary()).toEqual({ success: 3, pending: 1, failed: 2 });
  });

  it('does not reload when connections change without a refreshTrigger bump', () => {
    const fixture = TestBed.createComponent(WorkflowSummaryComponent);
    fixture.componentRef.setInput('connections', CONNECTIONS);
    fixture.componentRef.setInput('refreshTrigger', 1);
    TestBed.flushEffects();
    summaryServiceSpy.getSummary.mockClear();

    fixture.componentRef.setInput('connections', [{ organization: 'other-org', token: 'ghp_other' }]);
    TestBed.flushEffects();

    expect(summaryServiceSpy.getSummary).not.toHaveBeenCalled();
  });

  it('retries a trigger bumped during an in-flight load once loading completes', async () => {
    // First load hangs until we resolve it, keeping isLoading true.
    let resolveFirst!: (v: WorkflowSummary) => void;
    const firstLoad = new Promise<WorkflowSummary>(res => { resolveFirst = res; });
    summaryServiceSpy.getSummary
      .mockReturnValueOnce(firstLoad)
      .mockResolvedValueOnce({ success: 1, pending: 0, failed: 0 });

    const fixture = TestBed.createComponent(WorkflowSummaryComponent);
    fixture.componentRef.setInput('connections', CONNECTIONS);
    fixture.componentRef.setInput('refreshTrigger', 1);
    TestBed.flushEffects();
    expect(summaryServiceSpy.getSummary).toHaveBeenCalledTimes(1);

    // Bump the trigger while the first load is still in flight — must not be dropped.
    fixture.componentRef.setInput('refreshTrigger', 2);
    TestBed.flushEffects();
    expect(summaryServiceSpy.getSummary).toHaveBeenCalledTimes(1);

    // Complete the first load; the missed trigger should now be processed.
    resolveFirst({ success: 0, pending: 0, failed: 0 });
    await firstLoad;
    await Promise.resolve();
    TestBed.flushEffects();

    expect(summaryServiceSpy.getSummary).toHaveBeenCalledTimes(2);
  });

  it('renders the warning indicator when incompleteResults is true', async () => {
    const fixture = TestBed.createComponent(WorkflowSummaryComponent);
    fixture.componentInstance.summary.set({ success: 3, pending: 1, failed: 2, incompleteResults: true });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[title*="incomplete"]')).not.toBeNull();
  });

  it('does not render the warning indicator when incompleteResults is false', async () => {
    const fixture = TestBed.createComponent(WorkflowSummaryComponent);
    fixture.componentInstance.summary.set({ success: 3, pending: 1, failed: 2, incompleteResults: false });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[title*="incomplete"]')).toBeNull();
  });

  it('renders the warning indicator when all counts are zero but incompleteResults is true', async () => {
    const fixture = TestBed.createComponent(WorkflowSummaryComponent);
    fixture.componentInstance.summary.set({ success: 0, pending: 0, failed: 0, incompleteResults: true });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[title*="incomplete"]')).not.toBeNull();
  });

  it('resets summary to zeros on service error', async () => {
    summaryServiceSpy.getSummary.mockRejectedValueOnce(new Error('Network error'));

    const fixture = TestBed.createComponent(WorkflowSummaryComponent);
    fixture.componentRef.setInput('connections', CONNECTIONS);
    fixture.componentRef.setInput('refreshTrigger', 1);
    TestBed.flushEffects();

    await Promise.allSettled([summaryServiceSpy.getSummary.mock.results[0].value]);

    expect(fixture.componentInstance.summary()).toEqual({ success: 0, pending: 0, failed: 0 });
  });
});
