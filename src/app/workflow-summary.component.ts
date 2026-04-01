import { ChangeDetectionStrategy, Component, effect, input, signal, inject, untracked } from '@angular/core';
import { WorkflowSummaryService, WorkflowSummary } from './workflow-summary.service';

@Component({
  selector: 'app-workflow-summary',
  imports: [],
  templateUrl: './workflow-summary.component.html',
  styleUrls: ['./workflow-summary.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkflowSummaryComponent {
  private summaryService = inject(WorkflowSummaryService);

  organization = input('');
  token = input('');
  refreshTrigger = input(0);

  summary = signal<WorkflowSummary>({ success: 0, pending: 0, failed: 0 });
  isLoading = signal<boolean>(false);

  constructor() {
    effect(() => {
      const trigger = this.refreshTrigger();
      const org = untracked(this.organization);
      const tkn = untracked(this.token);

      if (org && tkn && trigger > 0 && !untracked(this.isLoading)) {
        void this.loadSummary(org, tkn);
      }
    });
  }

  private async loadSummary(organization: string, token: string): Promise<void> {
    this.isLoading.set(true);
    try {
      const summary = await this.summaryService.getSummary(organization, token);
      this.summary.set(summary);
    } catch (error) {
      console.error('Failed to load workflow summary', error);
      this.summary.set({ success: 0, pending: 0, failed: 0 });
    } finally {
      this.isLoading.set(false);
    }
  }
}
