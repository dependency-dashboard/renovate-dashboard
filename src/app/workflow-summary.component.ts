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

  constructor() {
    effect(() => {
      const trigger = this.refreshTrigger();
      const conns = untracked(this.connections);

      if (conns.length > 0 && trigger > 0 && !untracked(this.isLoading)) {
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
