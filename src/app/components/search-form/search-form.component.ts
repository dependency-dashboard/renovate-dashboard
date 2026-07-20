import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { OrgConnection } from '../../models/pull-request.model';

@Component({
  selector: 'app-search-form',
  imports: [],
  templateUrl: './search-form.component.html',
  styleUrls: ['./search-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchFormComponent {
  connections = input<OrgConnection[]>([]);
  isLoading = input(false);
  formValid = input(false);

  connectionsChange = output<OrgConnection[]>();
  searchTriggered = output<void>();

  draftOrg = signal('');
  draftToken = signal('');

  isDuplicateOrg = computed(() => {
    // GitHub org names are case-insensitive, so compare normalized values while
    // preserving the user's typed casing for display.
    const org = this.draftOrg().trim().toLowerCase();
    return org.length > 0 && this.connections().some(c => c.organization.trim().toLowerCase() === org);
  });

  draftValid = computed(() => {
    const org = this.draftOrg().trim();
    const token = this.draftToken().trim();
    return org.length > 0 && token.length > 0 && !this.isDuplicateOrg();
  });

  onDraftOrgChange(event: Event): void {
    this.draftOrg.set((event.target as HTMLInputElement).value);
  }

  onDraftTokenChange(event: Event): void {
    this.draftToken.set((event.target as HTMLInputElement).value);
  }

  addConnection(): void {
    if (!this.draftValid()) return;
    this.connectionsChange.emit([
      ...this.connections(),
      { organization: this.draftOrg().trim(), token: this.draftToken().trim() },
    ]);
    this.draftOrg.set('');
    this.draftToken.set('');
  }

  removeConnection(organization: string): void {
    this.connectionsChange.emit(this.connections().filter(c => c.organization !== organization));
  }

  onDraftEnter(event: Event): void {
    event.preventDefault();
    this.addConnection();
  }

  onSearch(): void {
    this.searchTriggered.emit();
  }
}
