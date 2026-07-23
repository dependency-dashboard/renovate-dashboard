import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

export type StatusFilter = 'all' | 'success' | 'pending' | 'failure';
export type GroupSort = 'failures' | 'prs' | 'name';

/**
 * Controls for the PR group list: text search, a workflow-status segmented
 * control, and a sort selector, with a "Showing X of Y" result count.
 */
@Component({
  selector: 'app-filter-bar',
  templateUrl: './filter-bar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilterBarComponent {
  searchText = model('');
  status = model<StatusFilter>('all');
  sortBy = model<GroupSort>('failures');

  resultCount = input(0);
  totalCount = input(0);

  readonly statusTabs: { value: StatusFilter; label: string; dot?: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'success', label: 'Passed', dot: 'bg-emerald-500' },
    { value: 'pending', label: 'Running', dot: 'bg-amber-400' },
    { value: 'failure', label: 'Failed', dot: 'bg-rose-500' },
  ];

  onSearchInput(event: Event): void {
    this.searchText.set((event.target as HTMLInputElement).value);
  }

  clearSearch(searchInput: HTMLInputElement): void {
    this.searchText.set('');
    // Keep focus in the field so the user can type a new query right away.
    searchInput.focus();
  }

  onSortChange(event: Event): void {
    this.sortBy.set((event.target as HTMLSelectElement).value as GroupSort);
  }
}
