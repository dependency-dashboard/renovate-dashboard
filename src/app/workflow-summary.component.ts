import { ChangeDetectionStrategy, Component, effect, input, signal, inject, untracked } from '@angular/core';
import { WorkflowSummaryService, WorkflowSummary } from './workflow-summary.service';
import { OrgConnection } from './models/pull-request.model';

@Component({
  selector: 'app-workflow-summary',
  imports: [],
  templateUrl: './workflow-summary.component.html',
  styleUrls: ['./workflow-summary.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkflowSummaryComponent {
  private summaryService = inject(WorkflowSummaryService);

  connections = input<OrgConnection[]>([]);
  refreshTrigger = input(0);

  summary = signal<WorkflowSummary>({ success: 0, pending: 0, failed: 0 });
  isLoading = signal<boolean>(false);

  private lastProcessedTrigger = 0;

  constructor() {
    effect(() => {
      const trigger = this.refreshTrigger();
      // Track isLoading so that a trigger bumped mid-load is retried once the
      // in-flight load finishes, instead of being silently dropped.
      const loading = this.isLoading();
      const conns = untracked(this.connections);

      if (trigger > 0 && trigger !== this.lastProcessedTrigger && conns.length > 0 && !loading) {
        this.lastProcessedTrigger = trigger;
        void this.loadSummary(conns);
      }
    });
  }

  private async loadSummary(connections: OrgConnection[]): Promise<void> {
    this.isLoading.set(true);
    try {
      const summary = await this.summaryService.getSummary(connections);
      this.summary.set(summary);
    } catch (error) {
      console.error('Failed to load workflow summary', error);
      this.summary.set({ success: 0, pending: 0, failed: 0 });
    } finally {
      this.isLoading.set(false);
    }
  }
}
