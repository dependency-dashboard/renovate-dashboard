import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CheckRun, PullRequest } from '../../models/pull-request.model';
import {
  CheckRunConclusionIconComponent,
  CheckRunStatusIconComponent,
  CiStatusIconComponent,
} from '../icons/status-icons.component';

@Component({
  selector: 'app-pr-item',
  imports: [CiStatusIconComponent, CheckRunStatusIconComponent, CheckRunConclusionIconComponent],
  templateUrl: './pr-item.component.html',
  styleUrls: ['./pr-item.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrItemComponent {
  pr = input.required<PullRequest>();
  expanded = input(false);

  toggleExpanded = output<void>();
  closePr = output<PullRequest>();
  approveAndMergePr = output<PullRequest>();

  get isMergeDisabled(): boolean {
    return this.pr().isProcessing || this.pr().workflowStatus === 'failure';
  }

  /** Platform-style reference: org/repo#42 for GitHub PRs, group/project!42 for GitLab MRs. */
  prRef = computed(() => {
    const pr = this.pr();
    const separator = pr.platform === 'gitlab' ? '!' : '#';
    return `${pr.repoOwner}/${pr.repoName}${separator}${pr.number}`;
  });

  /** DOM id of the expandable check-run region, for aria-controls. */
  detailsId = computed(() => `pr-details-${this.pr().uid.replace(/[^a-zA-Z0-9-]/g, '-')}`);

  workflowDotClass = computed(() => {
    switch (this.pr().workflowStatus) {
      case 'success': return 'bg-emerald-500';
      case 'failure': return 'bg-rose-500';
      case 'pending': return 'bg-amber-400';
      default: return 'bg-ink-3';
    }
  });

  workflowDotLabel = computed(() => {
    switch (this.pr().workflowStatus) {
      case 'success': return 'Workflow success';
      case 'failure': return 'Workflow failed';
      case 'pending': return 'Workflow pending';
      default: return 'Workflow unknown';
    }
  });

  checksTotal = computed(() => this.pr().checkRuns.length);

  checksPassed = computed(() =>
    this.pr().checkRuns.filter(
      cr => cr.conclusion === 'success' || cr.conclusion === 'skipped' || cr.conclusion === 'neutral',
    ).length,
  );

  checksPct = computed(() =>
    this.checksTotal() > 0 ? Math.round((this.checksPassed() / this.checksTotal()) * 100) : 0,
  );

  progressColor = computed(() => {
    switch (this.pr().workflowStatus) {
      case 'success': return 'bg-emerald-500';
      case 'pending': return 'bg-amber-400';
      case 'failure': return 'bg-rose-500';
      default: return 'bg-ink-3';
    }
  });

  /** Compact age like "5m", "3h", "2d", "1mo". */
  age = computed(() => {
    const created = new Date(this.pr().created_at).getTime();
    if (Number.isNaN(created)) return '';
    const minutes = Math.max(0, Math.floor((Date.now() - created) / 60_000));
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo`;
    return `${Math.floor(months / 12)}y`;
  });

  onClosePr(): void {
    this.closePr.emit(this.pr());
  }

  onApproveAndMergePr(): void {
    this.approveAndMergePr.emit(this.pr());
  }

  onToggleExpanded(): void {
    this.toggleExpanded.emit();
  }

  formatStatus(status: CheckRun['status']): string {
    switch (status) {
      case 'in_progress':
        return 'In Progress';
      case 'queued':
        return 'Queued';
      case 'completed':
      default:
        return 'Completed';
    }
  }

  formatConclusion(conclusion: CheckRun['conclusion']): string {
    if (!conclusion) {
      return 'Pending';
    }
    return conclusion
      .split('_')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
}
