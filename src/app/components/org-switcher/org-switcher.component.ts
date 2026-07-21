import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { OverlayModule, ConnectedPosition } from '@angular/cdk/overlay';
import { A11yModule } from '@angular/cdk/a11y';
import { OrgConnection } from '../../models/pull-request.model';

/**
 * Sidebar organization switcher: a trigger button summarizing the configured
 * connections, with a CDK-overlay popover for selecting the active org filter
 * and for listing, adding, and removing GitHub organizations.
 */
@Component({
  selector: 'app-org-switcher',
  imports: [OverlayModule, A11yModule],
  templateUrl: './org-switcher.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrgSwitcherComponent {
  connections = input<OrgConnection[]>([]);
  /** Active org filter; null means "all organizations". */
  selectedOrg = input<string | null>(null);
  connectionsChange = output<OrgConnection[]>();
  selectedOrgChange = output<string | null>();

  open = signal(false);
  view = signal<'list' | 'add'>('list');
  draftOrg = signal('');
  draftToken = signal('');

  // Prefer opening upward (the trigger sits at the bottom of the sidebar);
  // fall back to downward if there is no room above.
  readonly overlayPositions: ConnectedPosition[] = [
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -8 },
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 8 },
  ];

  triggerLabel = computed(() => {
    const selected = this.selectedOrg();
    if (selected) return selected;
    const conns = this.connections();
    if (conns.length === 0) return 'Add organization';
    if (conns.length === 1) return conns[0].organization;
    return 'All organizations';
  });

  avatarInitial = computed(() => {
    const selected = this.selectedOrg();
    if (selected) return selected.charAt(0).toUpperCase();
    const conns = this.connections();
    if (conns.length === 1) return conns[0].organization.charAt(0).toUpperCase();
    return conns.length > 1 ? String(conns.length) : '+';
  });

  /** The org filter is only meaningful with more than one configured org. */
  showSelection = computed(() => this.connections().length > 1);

  isActiveOrg(organization: string): boolean {
    return this.selectedOrg()?.toLowerCase() === organization.toLowerCase();
  }

  selectOrg(organization: string | null): void {
    this.selectedOrgChange.emit(organization);
    this.close();
  }

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

  toggle(): void {
    if (this.open()) {
      this.close();
    } else {
      // With nothing configured yet, the list view would be empty — go straight
      // to the add form.
      this.view.set(this.connections().length === 0 ? 'add' : 'list');
      this.open.set(true);
    }
  }

  close(): void {
    this.open.set(false);
    this.view.set('list');
    this.resetDraft();
  }

  showAddView(): void {
    this.resetDraft();
    this.view.set('add');
  }

  showListView(): void {
    this.view.set('list');
  }

  onOverlayKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.close();
    }
  }

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
    // Close so the refreshed results are immediately visible.
    this.close();
  }

  onAddSubmit(event: Event): void {
    event.preventDefault();
    this.addConnection();
  }

  removeConnection(organization: string): void {
    this.connectionsChange.emit(this.connections().filter(c => c.organization !== organization));
  }

  private resetDraft(): void {
    this.draftOrg.set('');
    this.draftToken.set('');
  }
}
