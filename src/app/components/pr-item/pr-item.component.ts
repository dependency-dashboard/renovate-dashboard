import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CiStatus, CheckRun, PullRequest } from '../../models/pull-request.model';

@Component({
  selector: 'app-pr-item',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pr-item.component.html',
  styleUrls: ['./pr-item.component.scss']
})
export class PrItemComponent {
  @Input({ required: true }) pr!: PullRequest;
  @Input() expanded = false;
  @Output() toggleExpanded = new EventEmitter<void>();
  
  @Output() closePr = new EventEmitter<PullRequest>();
  @Output() approveAndMergePr = new EventEmitter<PullRequest>();

  get isMergeDisabled(): boolean {
    return this.pr.isProcessing || this.pr.workflowStatus === 'failure';
  }

  onClosePr(): void {
    this.closePr.emit(this.pr);
  }

  onApproveAndMergePr(): void {
    this.approveAndMergePr.emit(this.pr);
  }

  onToggleExpanded(): void {
    this.toggleExpanded.emit();
  }

  getCIStatusIcon(status: CiStatus): string {
    switch (status) {
      case 'success': return '<svg class="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
      case 'failure': return '<svg class="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
      case 'pending': return '<svg class="w-6 h-6 text-yellow-500 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
      default: return '<svg class="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
    }
  }

  getWorkflowStatusIcon(status: CiStatus): string {
    switch (status) {
      case 'success': return '<span class="text-green-400 text-lg" title="Workflow Success">✅</span>';
      case 'failure': return '<span class="text-red-400 text-lg" title="Workflow Failed">❌</span>';
      case 'pending': return '<span class="text-yellow-400 text-lg" title="Workflow Pending">⏳</span>';
      default: return '<span class="text-gray-500 text-lg" title="Workflow Unknown">❓</span>';
    }
  }

  getCheckRunStatusIcon(status: CheckRun['status']): string {
    switch (status) {
      case 'queued':
        return '<svg class="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8h2a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V10a2 2 0 012-2h2"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 12v9m0-9a4 4 0 100-8h0a4 4 0 000 8z"></path></svg>';
      case 'in_progress':
        return '<svg class="w-4 h-4 text-yellow-400 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle class="opacity-25" cx="12" cy="12" r="10" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V2C5.373 2 1 6.373 1 12h3zm2 5.291A7.962 7.962 0 014 12H1c0 3.042 1.135 5.824 3 7.938l2-2.647z"></path></svg>';
      case 'completed':
      default:
        return '<svg class="w-4 h-4 text-green-400" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 00-1.414 0L9 11.586 6.707 9.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l7-7a1 1 0 000-1.414z" clip-rule="evenodd" /></svg>';
    }
  }

  getCheckRunConclusionIcon(conclusion: CheckRun['conclusion']): string {
    switch (conclusion) {
      case 'success':
        return '<svg class="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>';
      case 'failure':
      case 'timed_out':
      case 'action_required':
        return '<svg class="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path></svg>';
      case 'cancelled':
      case 'neutral':
      case 'skipped':
        return '<svg class="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clip-rule="evenodd"></path></svg>';
      default:
        return '<svg class="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"></path></svg>';
    }
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
