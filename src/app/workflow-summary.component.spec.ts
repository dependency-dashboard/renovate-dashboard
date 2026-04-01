import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { WorkflowSummaryComponent } from './workflow-summary.component';
import { WorkflowSummaryService } from './workflow-summary.service';

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
    fixture.componentRef.setInput('organization', 'my-org');
    fixture.componentRef.setInput('token', 'ghp_test');
    fixture.componentRef.setInput('refreshTrigger', 0);
    TestBed.flushEffects();

    expect(summaryServiceSpy.getSummary).not.toHaveBeenCalled();
  });

  it('does not load when organization or token is missing', async () => {
    const fixture = TestBed.createComponent(WorkflowSummaryComponent);
    fixture.componentRef.setInput('organization', '');
    fixture.componentRef.setInput('token', '');
    fixture.componentRef.setInput('refreshTrigger', 1);
    TestBed.flushEffects();

    expect(summaryServiceSpy.getSummary).not.toHaveBeenCalled();
  });

  it('loads summary when organization, token, and refreshTrigger > 0 are provided', async () => {
    const fixture = TestBed.createComponent(WorkflowSummaryComponent);
    fixture.componentRef.setInput('organization', 'my-org');
    fixture.componentRef.setInput('token', 'ghp_test');
    fixture.componentRef.setInput('refreshTrigger', 1);
    TestBed.flushEffects();

    expect(summaryServiceSpy.getSummary).toHaveBeenCalledWith('my-org', 'ghp_test');
  });

  it('updates summary signal after successful load', async () => {
    const fixture = TestBed.createComponent(WorkflowSummaryComponent);
    fixture.componentRef.setInput('organization', 'my-org');
    fixture.componentRef.setInput('token', 'ghp_test');
    fixture.componentRef.setInput('refreshTrigger', 1);
    TestBed.flushEffects();

    // Wait for the async getSummary to resolve
    await summaryServiceSpy.getSummary.mock.results[0].value;

    expect(fixture.componentInstance.summary()).toEqual({ success: 3, pending: 1, failed: 2 });
  });

  it('does not reload when organization changes without a refreshTrigger bump', () => {
    const fixture = TestBed.createComponent(WorkflowSummaryComponent);
    fixture.componentRef.setInput('organization', 'my-org');
    fixture.componentRef.setInput('token', 'ghp_test');
    fixture.componentRef.setInput('refreshTrigger', 1);
    TestBed.flushEffects();
    summaryServiceSpy.getSummary.mockClear();

    // Simulate the user editing the organization field without re-submitting
    fixture.componentRef.setInput('organization', 'my-org-edited');
    TestBed.flushEffects();

    expect(summaryServiceSpy.getSummary).not.toHaveBeenCalled();
  });

  it('does not reload when token changes without a refreshTrigger bump', () => {
    const fixture = TestBed.createComponent(WorkflowSummaryComponent);
    fixture.componentRef.setInput('organization', 'my-org');
    fixture.componentRef.setInput('token', 'ghp_test');
    fixture.componentRef.setInput('refreshTrigger', 1);
    TestBed.flushEffects();
    summaryServiceSpy.getSummary.mockClear();

    fixture.componentRef.setInput('token', 'ghp_new_token');
    TestBed.flushEffects();

    expect(summaryServiceSpy.getSummary).not.toHaveBeenCalled();
  });

  it('resets summary to zeros on service error', async () => {
    summaryServiceSpy.getSummary.mockRejectedValueOnce(new Error('Network error'));

    const fixture = TestBed.createComponent(WorkflowSummaryComponent);
    fixture.componentRef.setInput('organization', 'my-org');
    fixture.componentRef.setInput('token', 'ghp_test');
    fixture.componentRef.setInput('refreshTrigger', 1);
    TestBed.flushEffects();

    await Promise.allSettled([summaryServiceSpy.getSummary.mock.results[0].value]);

    expect(fixture.componentInstance.summary()).toEqual({ success: 0, pending: 0, failed: 0 });
  });
});
