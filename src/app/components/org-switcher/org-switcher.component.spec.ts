import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { OverlayContainer } from '@angular/cdk/overlay';
import { OrgSwitcherComponent } from './org-switcher.component';
import { connectionKey, DEFAULT_GITHUB_HOST, OrgConnection } from '../../models/pull-request.model';

const ORG_A: OrgConnection = { platform: 'github', host: DEFAULT_GITHUB_HOST, organization: 'org-a', token: 'ghp_aaa' };
const ORG_B: OrgConnection = { platform: 'github', host: DEFAULT_GITHUB_HOST, organization: 'org-b', token: 'ghp_bbb' };

describe('OrgSwitcherComponent', () => {
  let overlayEl: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrgSwitcherComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    overlayEl = TestBed.inject(OverlayContainer).getContainerElement();
  });

  function createFixture(connections: OrgConnection[]) {
    const fixture = TestBed.createComponent(OrgSwitcherComponent);
    fixture.componentRef.setInput('connections', connections);
    fixture.detectChanges();
    return fixture;
  }

  function openPopover(fixture: ReturnType<typeof createFixture>) {
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
  }

  it('should create', () => {
    const fixture = createFixture([]);
    expect(fixture.componentInstance).toBeTruthy();
  });

  describe('trigger', () => {
    it('prompts to add an organization when none are configured', () => {
      const fixture = createFixture([]);
      expect(fixture.nativeElement.textContent).toContain('Add organization');
    });

    it('shows the org name when exactly one is configured', () => {
      const fixture = createFixture([ORG_A]);
      expect(fixture.nativeElement.textContent).toContain('org-a');
    });

    it('shows "All organizations" when multiple orgs are configured and none is selected', () => {
      const fixture = createFixture([ORG_A, ORG_B]);
      expect(fixture.nativeElement.textContent).toContain('All organizations');
    });

    it('shows the selected org when one is active', () => {
      const fixture = createFixture([ORG_A, ORG_B]);
      fixture.componentRef.setInput('selectedKey', connectionKey(ORG_B));
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('org-b');
    });
  });

  describe('org selection', () => {
    it('offers an "All organizations" option only when multiple orgs are configured', () => {
      const multi = createFixture([ORG_A, ORG_B]);
      openPopover(multi);
      expect(overlayEl.textContent).toContain('All organizations');
      multi.componentInstance.close();
      multi.detectChanges();

      const single = createFixture([ORG_A]);
      openPopover(single);
      expect(overlayEl.textContent).not.toContain('All organizations');
    });

    it('emits selectedKeyChange with the connection key and closes when an org is clicked', () => {
      const fixture = createFixture([ORG_A, ORG_B]);
      openPopover(fixture);

      const emitted: (string | null)[] = [];
      fixture.componentInstance.selectedKeyChange.subscribe((v: string | null) => emitted.push(v));

      (overlayEl.querySelector('[aria-label="Show only org-b"]') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(emitted).toEqual([connectionKey(ORG_B)]);
      expect(fixture.componentInstance.open()).toBe(false);
    });

    it('emits null when "All organizations" is clicked', () => {
      const fixture = createFixture([ORG_A, ORG_B]);
      fixture.componentRef.setInput('selectedKey', connectionKey(ORG_A));
      openPopover(fixture);

      const emitted: (string | null)[] = [];
      fixture.componentInstance.selectedKeyChange.subscribe((v: string | null) => emitted.push(v));

      const allBtn = Array.from(overlayEl.querySelectorAll('button')).find(
        b => b.textContent?.includes('All organizations')) as HTMLButtonElement;
      allBtn.click();

      expect(emitted).toEqual([null]);
    });

    it('marks the active org with aria-pressed', () => {
      const fixture = createFixture([ORG_A, ORG_B]);
      fixture.componentRef.setInput('selectedKey', connectionKey(ORG_A));
      openPopover(fixture);

      expect(overlayEl.querySelector('[aria-label="Show only org-a"]')?.getAttribute('aria-pressed')).toBe('true');
      expect(overlayEl.querySelector('[aria-label="Show only org-b"]')?.getAttribute('aria-pressed')).toBe('false');
    });

    it('does not render selectable org rows with a single connection', () => {
      const fixture = createFixture([ORG_A]);
      openPopover(fixture);

      expect(overlayEl.querySelector('[aria-label^="Show only"]')).toBeNull();
      // The org is still listed (with its remove button).
      expect(overlayEl.textContent).toContain('org-a');
      expect(overlayEl.querySelector('[aria-label="Remove org-a"]')).not.toBeNull();
    });
  });

  describe('popover', () => {
    it('opens listing each configured organization', () => {
      const fixture = createFixture([ORG_A, ORG_B]);
      openPopover(fixture);

      expect(fixture.componentInstance.open()).toBe(true);
      expect(overlayEl.textContent).toContain('org-a');
      expect(overlayEl.textContent).toContain('org-b');
    });

    it('opens directly in the add view when no orgs are configured', () => {
      const fixture = createFixture([]);
      openPopover(fixture);

      expect(fixture.componentInstance.view()).toBe('form');
      expect(overlayEl.querySelector('#draft-org')).not.toBeNull();
    });

    it('closes on Escape and resets to the list view', () => {
      const fixture = createFixture([ORG_A]);
      openPopover(fixture);
      fixture.componentInstance.showAddView();
      fixture.componentInstance.draftOrg.set('pending');

      fixture.componentInstance.onOverlayKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
      fixture.detectChanges();

      expect(fixture.componentInstance.open()).toBe(false);
      expect(fixture.componentInstance.view()).toBe('list');
      expect(fixture.componentInstance.draftOrg()).toBe('');
    });

    it('emits connectionsChange without the removed org when Remove is clicked', () => {
      const fixture = createFixture([ORG_A, ORG_B]);
      openPopover(fixture);

      const emitted: OrgConnection[][] = [];
      fixture.componentInstance.connectionsChange.subscribe((v: OrgConnection[]) => emitted.push(v));

      (overlayEl.querySelector('[aria-label="Remove org-a"]') as HTMLButtonElement).click();

      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toEqual([ORG_B]);
    });
  });

  describe('add organization', () => {
    it('submit is disabled when draft fields are empty', () => {
      const fixture = createFixture([]);
      openPopover(fixture);

      const submit = overlayEl.querySelector('button[type="submit"]') as HTMLButtonElement;
      expect(submit.disabled).toBe(true);
    });

    it('submit is disabled when the org is already added', () => {
      const fixture = createFixture([ORG_A]);
      openPopover(fixture);
      fixture.componentInstance.showAddView();
      fixture.componentInstance.draftOrg.set('org-a');
      fixture.componentInstance.draftToken.set('ghp_new');
      fixture.detectChanges();

      const submit = overlayEl.querySelector('button[type="submit"]') as HTMLButtonElement;
      expect(submit.disabled).toBe(true);
      expect(overlayEl.textContent).toContain('Already added');
    });

    it('detects duplicates case-insensitively (GitHub orgs are case-insensitive)', () => {
      const fixture = createFixture([ORG_A]); // 'org-a'
      fixture.componentInstance.draftOrg.set('  ORG-A  ');

      expect(fixture.componentInstance.isDuplicateOrg()).toBe(true);
      expect(fixture.componentInstance.draftValid()).toBe(false);
    });

    it('emits the new connection appended and trimmed, then closes the popover', () => {
      const fixture = createFixture([ORG_A]);
      openPopover(fixture);
      fixture.componentInstance.showAddView();
      fixture.componentInstance.draftOrg.set('  org-b  ');
      fixture.componentInstance.draftToken.set('  ghp_bbb  ');
      fixture.detectChanges();

      const emitted: OrgConnection[][] = [];
      fixture.componentInstance.connectionsChange.subscribe((v: OrgConnection[]) => emitted.push(v));

      (overlayEl.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
      fixture.detectChanges();

      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toEqual([ORG_A, ORG_B]);
      expect(fixture.componentInstance.open()).toBe(false);
      expect(fixture.componentInstance.draftOrg()).toBe('');
      expect(fixture.componentInstance.draftToken()).toBe('');
    });

    it('emits a normalized host and author from the advanced fields', () => {
      const fixture = createFixture([]);
      openPopover(fixture);
      fixture.componentInstance.draftOrg.set('ghes-org');
      fixture.componentInstance.draftToken.set('ghp_ghes');
      fixture.componentInstance.draftHost.set('https://ghes.example.com/');
      fixture.componentInstance.draftAuthor.set(' renovate-bot ');
      fixture.detectChanges();

      const emitted: OrgConnection[][] = [];
      fixture.componentInstance.connectionsChange.subscribe((v: OrgConnection[]) => emitted.push(v));

      (overlayEl.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));

      expect(emitted[0]).toEqual([{
        platform: 'github',
        host: 'https://ghes.example.com',
        organization: 'ghes-org',
        token: 'ghp_ghes',
        renovateAuthor: 'renovate-bot',
      }]);
    });

    it('rejects an unparsable server URL', () => {
      const fixture = createFixture([]);
      openPopover(fixture);
      fixture.componentInstance.draftOrg.set('org');
      fixture.componentInstance.draftToken.set('tok');
      fixture.componentInstance.draftHost.set('not a url');
      fixture.componentInstance.showAdvanced.set(true);
      fixture.detectChanges();

      expect(fixture.componentInstance.draftValid()).toBe(false);
      expect(overlayEl.textContent).toContain('Enter a valid http(s) URL');
    });

    it('treats the same org on a different host as a new connection, not a duplicate', () => {
      const fixture = createFixture([ORG_A]); // org-a on github.com
      fixture.componentInstance.draftOrg.set('org-a');
      fixture.componentInstance.draftToken.set('tok');

      expect(fixture.componentInstance.isDuplicateOrg()).toBe(true);

      fixture.componentInstance.draftHost.set('https://ghes.example.com');

      expect(fixture.componentInstance.isDuplicateOrg()).toBe(false);
      expect(fixture.componentInstance.draftValid()).toBe(true);
    });

    it('emits a GitLab connection with the gitlab.com default host when GitLab is selected', () => {
      const fixture = createFixture([]);
      openPopover(fixture);
      fixture.componentInstance.setDraftPlatform('gitlab');
      fixture.componentInstance.draftOrg.set('my-group');
      fixture.componentInstance.draftToken.set('glpat-x');
      fixture.detectChanges();

      const emitted: OrgConnection[][] = [];
      fixture.componentInstance.connectionsChange.subscribe((v: OrgConnection[]) => emitted.push(v));

      (overlayEl.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));

      expect(emitted[0]).toEqual([{
        platform: 'gitlab',
        host: 'https://gitlab.com',
        organization: 'my-group',
        token: 'glpat-x',
      }]);
    });

    it('adapts the add-form copy to the selected platform', () => {
      const fixture = createFixture([]);
      openPopover(fixture);
      expect(overlayEl.textContent).toContain('Organization');

      fixture.componentInstance.setDraftPlatform('gitlab');
      fixture.detectChanges();

      expect(overlayEl.textContent).toContain('Group');
      const tokenInput = overlayEl.querySelector('#draft-token') as HTMLInputElement;
      expect(tokenInput.placeholder).toContain("'api' scope");
    });

    it('treats the same org on a different platform as a new connection', () => {
      const gitlabOrgA: OrgConnection = {
        platform: 'gitlab', host: 'https://gitlab.com', organization: 'org-a', token: 't',
      };
      const fixture = createFixture([gitlabOrgA]);
      fixture.componentInstance.draftOrg.set('org-a');
      fixture.componentInstance.draftToken.set('tok');

      // Draft defaults to GitHub on github.com — distinct from the GitLab connection.
      expect(fixture.componentInstance.isDuplicateOrg()).toBe(false);

      fixture.componentInstance.setDraftPlatform('gitlab');
      expect(fixture.componentInstance.isDuplicateOrg()).toBe(true);
    });

    it('does not emit when the draft is invalid', () => {
      const fixture = createFixture([]);
      const emitted: OrgConnection[][] = [];
      fixture.componentInstance.connectionsChange.subscribe((v: OrgConnection[]) => emitted.push(v));

      fixture.componentInstance.saveConnection();

      expect(emitted).toHaveLength(0);
    });

    it('resets a pending draft when navigating back to the list', () => {
      const fixture = createFixture([ORG_A]);
      openPopover(fixture);
      fixture.componentInstance.showAddView();
      fixture.componentInstance.draftOrg.set('pending');

      fixture.componentInstance.showListView();

      expect(fixture.componentInstance.draftOrg()).toBe('');
      expect(fixture.componentInstance.editingKey()).toBeNull();
    });

    it('shows a back button to the list only when orgs already exist', () => {
      const withOrgs = createFixture([ORG_A]);
      openPopover(withOrgs);
      withOrgs.componentInstance.showAddView();
      withOrgs.detectChanges();
      expect(overlayEl.querySelector('[aria-label="Back to organization list"]')).not.toBeNull();
      withOrgs.componentInstance.close();
      withOrgs.detectChanges();

      const withoutOrgs = createFixture([]);
      openPopover(withoutOrgs);
      expect(overlayEl.querySelector('[aria-label="Back to organization list"]')).toBeNull();
    });
  });

  describe('edit organization', () => {
    const GHES_ORG: OrgConnection = {
      platform: 'github',
      host: 'https://ghes.example.com',
      organization: 'ghes-org',
      token: 'ghp_ghes',
      renovateAuthor: 'renovate-bot',
    };

    function openEditForm(fixture: ReturnType<typeof createFixture>, org: string) {
      openPopover(fixture);
      (overlayEl.querySelector(`[aria-label="Edit ${org}"]`) as HTMLButtonElement).click();
      fixture.detectChanges();
    }

    it('renders an edit button for each connection', () => {
      const fixture = createFixture([ORG_A, ORG_B]);
      openPopover(fixture);

      expect(overlayEl.querySelector('[aria-label="Edit org-a"]')).not.toBeNull();
      expect(overlayEl.querySelector('[aria-label="Edit org-b"]')).not.toBeNull();
    });

    it('opens the form prefilled with the connection values', () => {
      const fixture = createFixture([ORG_A]);
      openEditForm(fixture, 'org-a');

      const instance = fixture.componentInstance;
      expect(instance.view()).toBe('form');
      expect(instance.editingKey()).toBe(connectionKey(ORG_A));
      expect(instance.draftOrg()).toBe('org-a');
      expect(instance.draftToken()).toBe('ghp_aaa');
      // Default host: the advanced section stays collapsed with an empty host field.
      expect(instance.draftHost()).toBe('');
      expect(instance.showAdvanced()).toBe(false);
      expect(overlayEl.textContent).toContain('Edit organization');
      expect(overlayEl.querySelector('button[type="submit"]')?.textContent).toContain('Save changes');
    });

    it('prefills host and author and expands the advanced section for a GHES connection', () => {
      const fixture = createFixture([GHES_ORG]);
      openEditForm(fixture, 'ghes-org');

      const instance = fixture.componentInstance;
      expect(instance.draftHost()).toBe('https://ghes.example.com');
      expect(instance.draftAuthor()).toBe('renovate-bot');
      expect(instance.showAdvanced()).toBe(true);
    });

    it('does not flag the edited connection as a duplicate of itself', () => {
      const fixture = createFixture([ORG_A, ORG_B]);
      openEditForm(fixture, 'org-a');

      expect(fixture.componentInstance.isDuplicateOrg()).toBe(false);
      expect(fixture.componentInstance.draftValid()).toBe(true);
    });

    it('still flags a collision with a different existing connection', () => {
      const fixture = createFixture([ORG_A, ORG_B]);
      openEditForm(fixture, 'org-a');
      fixture.componentInstance.draftOrg.set('org-b');
      fixture.detectChanges();

      expect(fixture.componentInstance.isDuplicateOrg()).toBe(true);
      expect(overlayEl.textContent).toContain('Already added');
    });

    it('replaces the connection in place on submit and closes the popover', () => {
      const fixture = createFixture([ORG_A, ORG_B]);
      openEditForm(fixture, 'org-a');
      fixture.componentInstance.draftToken.set('ghp_rotated');
      fixture.detectChanges();

      const emitted: OrgConnection[][] = [];
      fixture.componentInstance.connectionsChange.subscribe((v: OrgConnection[]) => emitted.push(v));

      (overlayEl.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
      fixture.detectChanges();

      expect(emitted).toEqual([[{ ...ORG_A, token: 'ghp_rotated' }, ORG_B]]);
      expect(fixture.componentInstance.open()).toBe(false);
      expect(fixture.componentInstance.editingKey()).toBeNull();
    });

    it('re-points the org filter when the active connection is renamed', () => {
      const fixture = createFixture([ORG_A, ORG_B]);
      fixture.componentRef.setInput('selectedKey', connectionKey(ORG_A));
      fixture.detectChanges();
      openEditForm(fixture, 'org-a');
      fixture.componentInstance.draftOrg.set('org-a-renamed');

      const events: { kind: string; value: unknown }[] = [];
      fixture.componentInstance.selectedKeyChange.subscribe((v: string | null) =>
        events.push({ kind: 'selectedKey', value: v }));
      fixture.componentInstance.connectionsChange.subscribe((v: OrgConnection[]) =>
        events.push({ kind: 'connections', value: v }));

      fixture.componentInstance.saveConnection();

      // The new selected key must arrive before the connection list so the
      // parent never holds a key that matches no connection.
      expect(events.map(e => e.kind)).toEqual(['selectedKey', 'connections']);
      expect(events[0].value).toBe(connectionKey({ ...ORG_A, organization: 'org-a-renamed' }));
      expect(events[1].value).toEqual([{ ...ORG_A, organization: 'org-a-renamed' }, ORG_B]);
    });

    it('does not touch the org filter when editing a non-selected connection', () => {
      const fixture = createFixture([ORG_A, ORG_B]);
      fixture.componentRef.setInput('selectedKey', connectionKey(ORG_B));
      fixture.detectChanges();
      openEditForm(fixture, 'org-a');
      fixture.componentInstance.draftOrg.set('org-a-renamed');

      const selectedKeys: (string | null)[] = [];
      fixture.componentInstance.selectedKeyChange.subscribe((v: string | null) => selectedKeys.push(v));

      fixture.componentInstance.saveConnection();

      expect(selectedKeys).toHaveLength(0);
    });
  });
});
