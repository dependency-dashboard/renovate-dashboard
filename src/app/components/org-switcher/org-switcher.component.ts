import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { OverlayModule, ConnectedPosition } from '@angular/cdk/overlay';
import { A11yModule } from '@angular/cdk/a11y';
import {
  connectionKey,
  defaultHostFor,
  normalizeHost,
  OrgConnection,
  Platform,
  DEFAULT_GITHUB_HOST,
} from '../../models/pull-request.model';

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
  /** Active org filter as a canonical connection key; null means "all organizations". */
  selectedKey = input<string | null>(null);
  connectionsChange = output<OrgConnection[]>();
  selectedKeyChange = output<string | null>();

  open = signal(false);
  view = signal<'list' | 'add'>('list');
  showAdvanced = signal(false);
  draftPlatform = signal<Platform>('github');
  draftOrg = signal('');
  draftToken = signal('');
  draftHost = signal('');
  draftAuthor = signal('');

  readonly platforms: { value: Platform; label: string }[] = [
    { value: 'github', label: 'GitHub' },
    { value: 'gitlab', label: 'GitLab' },
  ];

  /** Platform-dependent add-form copy. */
  draftCopy = computed(() => {
    if (this.draftPlatform() === 'gitlab') {
      return {
        orgLabel: 'Group',
        orgPlaceholder: 'e.g., my-group',
        tokenPlaceholder: "Token with 'api' scope",
        hostPlaceholder: 'https://gitlab.com',
        hostNote: 'For self-hosted GitLab; leave empty for gitlab.com.',
        authorPlaceholder: 'renovate-bot',
      };
    }
    return {
      orgLabel: 'Organization',
      orgPlaceholder: 'e.g., my-github-org',
      tokenPlaceholder: "Token with 'repo' scope",
      hostPlaceholder: 'https://github.com',
      hostNote: 'For GitHub Enterprise Server; leave empty for github.com.',
      authorPlaceholder: 'app/renovate',
    };
  });

  // Prefer opening upward (the trigger sits at the bottom of the sidebar);
  // fall back to downward if there is no room above.
  readonly overlayPositions: ConnectedPosition[] = [
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -8 },
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 8 },
  ];

  selectedConnection = computed(() => {
    const key = this.selectedKey();
    if (!key) return undefined;
    return this.connections().find(c => connectionKey(c) === key);
  });

  triggerLabel = computed(() => {
    const selected = this.selectedConnection();
    if (selected) return selected.organization;
    const conns = this.connections();
    if (conns.length === 0) return 'Add organization';
    if (conns.length === 1) return conns[0].organization;
    return 'All organizations';
  });

  triggerSublabel = computed(() => {
    const selected = this.selectedConnection();
    if (selected) return this.hostLabel(selected.host);
    const hosts = [...new Set(this.connections().map(c => c.host))];
    if (hosts.length === 1) return this.hostLabel(hosts[0]);
    if (hosts.length > 1) return `${hosts.length} servers`;
    return this.hostLabel(DEFAULT_GITHUB_HOST);
  });

  avatarInitial = computed(() => {
    const selected = this.selectedConnection();
    if (selected) return selected.organization.charAt(0).toUpperCase();
    const conns = this.connections();
    if (conns.length === 1) return conns[0].organization.charAt(0).toUpperCase();
    return conns.length > 1 ? String(conns.length) : '+';
  });

  /** Platform mark shown in the trigger; null when connections span both platforms. */
  triggerPlatform = computed<Platform | null>(() => {
    const selected = this.selectedConnection();
    if (selected) return selected.platform;
    const platforms = [...new Set(this.connections().map(c => c.platform))];
    if (platforms.length === 1) return platforms[0];
    return platforms.length === 0 ? 'github' : null;
  });

  /** The org filter is only meaningful with more than one configured org. */
  showSelection = computed(() => this.connections().length > 1);

  /** Compact display form of a connection host, e.g. 'ghes.example.com'. */
  hostLabel(host: string): string {
    try {
      return new URL(host).host;
    } catch {
      return host;
    }
  }

  isActive(conn: OrgConnection): boolean {
    return this.selectedKey() === connectionKey(conn);
  }

  select(conn: OrgConnection | null): void {
    this.selectedKeyChange.emit(conn ? connectionKey(conn) : null);
    this.close();
  }

  private draftHostNormalized = computed(() =>
    normalizeHost(this.draftHost(), defaultHostFor(this.draftPlatform())),
  );

  draftHostInvalid = computed(
    () => this.draftHost().trim().length > 0 && this.draftHostNormalized() === null,
  );

  isDuplicateOrg = computed(() => {
    // Identity is platform + host + org (orgs are case-insensitive); the same
    // org name on a different server or platform is a distinct connection.
    const organization = this.draftOrg().trim();
    const host = this.draftHostNormalized();
    if (!organization || !host) return false;
    const key = connectionKey({ platform: this.draftPlatform(), host, organization });
    return this.connections().some(c => connectionKey(c) === key);
  });

  setDraftPlatform(platform: Platform): void {
    this.draftPlatform.set(platform);
  }

  draftValid = computed(() => {
    const org = this.draftOrg().trim();
    const token = this.draftToken().trim();
    return org.length > 0 && token.length > 0 && !this.isDuplicateOrg() && !this.draftHostInvalid();
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

  toggleAdvanced(): void {
    this.showAdvanced.set(!this.showAdvanced());
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

  onDraftHostChange(event: Event): void {
    this.draftHost.set((event.target as HTMLInputElement).value);
  }

  onDraftAuthorChange(event: Event): void {
    this.draftAuthor.set((event.target as HTMLInputElement).value);
  }

  addConnection(): void {
    if (!this.draftValid()) return;
    const host = this.draftHostNormalized() ?? defaultHostFor(this.draftPlatform());
    const renovateAuthor = this.draftAuthor().trim();
    const connection: OrgConnection = {
      platform: this.draftPlatform(),
      host,
      organization: this.draftOrg().trim(),
      token: this.draftToken().trim(),
      ...(renovateAuthor ? { renovateAuthor } : {}),
    };
    this.connectionsChange.emit([...this.connections(), connection]);
    // Close so the refreshed results are immediately visible.
    this.close();
  }

  onAddSubmit(event: Event): void {
    event.preventDefault();
    this.addConnection();
  }

  removeConnection(conn: OrgConnection): void {
    const key = connectionKey(conn);
    this.connectionsChange.emit(this.connections().filter(c => connectionKey(c) !== key));
  }

  private resetDraft(): void {
    this.draftPlatform.set('github');
    this.draftOrg.set('');
    this.draftToken.set('');
    this.draftHost.set('');
    this.draftAuthor.set('');
    this.showAdvanced.set(false);
  }
}
