import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PrGroup, PullRequest } from '../../models/pull-request.model';
import { PrItemComponent } from '../pr-item/pr-item.component';

@Component({
  selector: 'app-pr-group',
  standalone: true,
  imports: [CommonModule, PrItemComponent],
  templateUrl: './pr-group.component.html',
  styleUrls: ['./pr-group.component.scss']
})
export class PrGroupComponent {
  @Input({ required: true }) group!: PrGroup;
  @Input() expandedPrIds: ReadonlySet<number> = new Set<number>();
  
  @Output() toggleGroup = new EventEmitter<PrGroup>();
  @Output() closePr = new EventEmitter<PullRequest>();
  @Output() approveAndMergePr = new EventEmitter<PullRequest>();
  @Output() closeGroupPrs = new EventEmitter<PrGroup>();
  @Output() approveAndMergeGroupPrs = new EventEmitter<PrGroup>();
  @Output() togglePr = new EventEmitter<PullRequest>();

  onToggleGroup(): void {
    this.toggleGroup.emit(this.group);
  }

  onClosePr(pr: PullRequest): void {
    this.closePr.emit(pr);
  }

  onApproveAndMergePr(pr: PullRequest): void {
    this.approveAndMergePr.emit(pr);
  }

  onCloseGroup(): void {
    this.closeGroupPrs.emit(this.group);
  }

  onApproveAndMergeGroup(): void {
    this.approveAndMergeGroupPrs.emit(this.group);
  }

  togglePrExpansion(pr: PullRequest): void {
    this.togglePr.emit(pr);
  }

  isGroupProcessing(): boolean {
    return this.group.prs.some(pr => pr.isProcessing);
  }

  hasFailingWorkflows(): boolean {
    return this.group.prs.some(pr => pr.workflowStatus === 'failure');
  }

  isGroupMergeDisabled(): boolean {
    return this.isGroupProcessing() || this.hasFailingWorkflows();
  }

  getCIStatusIcon(status: PrGroup['aggregateCiStatus']): string {
    switch (status) {
      case 'success': return '<svg class="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
      case 'failure': return '<svg class="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
      case 'pending': return '<svg class="w-6 h-6 text-yellow-500 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
      default: return '<svg class="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
    }
  }
}
