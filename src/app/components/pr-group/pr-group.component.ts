import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { PrGroup, PullRequest } from '../../models/pull-request.model';
import { PrItemComponent } from '../pr-item/pr-item.component';
import { CiStatusIconComponent } from '../icons/status-icons.component';

@Component({
  selector: 'app-pr-group',
  imports: [PrItemComponent, CiStatusIconComponent],
  templateUrl: './pr-group.component.html',
  styleUrls: ['./pr-group.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrGroupComponent {
  group = input.required<PrGroup>();
  expandedPrIds = input<ReadonlySet<string>>(new Set<string>());
  /** True while a per-group status refresh is in flight. */
  refreshing = input(false);

  toggleGroup = output<PrGroup>();
  refreshGroup = output<PrGroup>();
  closePr = output<PullRequest>();
  approveAndMergePr = output<PullRequest>();
  closeGroupPrs = output<PrGroup>();
  approveAndMergeGroupPrs = output<PrGroup>();
  togglePr = output<PullRequest>();

  onToggleGroup(): void {
    this.toggleGroup.emit(this.group());
  }

  onRefreshGroup(): void {
    this.refreshGroup.emit(this.group());
  }

  onClosePr(pr: PullRequest): void {
    this.closePr.emit(pr);
  }

  onApproveAndMergePr(pr: PullRequest): void {
    this.approveAndMergePr.emit(pr);
  }

  onCloseGroup(): void {
    this.closeGroupPrs.emit(this.group());
  }

  onApproveAndMergeGroup(): void {
    this.approveAndMergeGroupPrs.emit(this.group());
  }

  togglePrExpansion(pr: PullRequest): void {
    this.togglePr.emit(pr);
  }

  isGroupProcessing = computed(() => this.group().prs.some(pr => pr.isProcessing));
  hasFailingWorkflows = computed(() => this.group().prs.some(pr => pr.workflowStatus === 'failure'));
  isGroupMergeDisabled = computed(() => this.isGroupProcessing() || this.hasFailingWorkflows());

  /** DOM id of the expandable PR-list region, for aria-controls. */
  panelId = computed(() => `group-panel-${this.group().title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);

  ciStatusLabel = computed(() => `Group CI status: ${this.group().aggregateCiStatus}`);

}
