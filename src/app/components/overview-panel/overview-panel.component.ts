import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PrGroup } from '../../models/pull-request.model';

/**
 * Stat tiles summarizing the visible PRs (total / passed / running / failing).
 * Derived entirely from the already-fetched groups, so the numbers always
 * match the board and follow the active org filter — no extra API calls.
 */
@Component({
  selector: 'app-overview-panel',
  templateUrl: './overview-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewPanelComponent {
  groups = input<PrGroup[]>([]);

  stats = computed(() => {
    const prs = this.groups().flatMap(group => group.prs);
    return {
      total: prs.length,
      passed: prs.filter(pr => pr.workflowStatus === 'success').length,
      running: prs.filter(pr => pr.workflowStatus === 'pending').length,
      failing: prs.filter(pr => pr.workflowStatus === 'failure').length,
    };
  });
}
