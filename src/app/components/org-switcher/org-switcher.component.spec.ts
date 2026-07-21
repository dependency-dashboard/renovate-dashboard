import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { OverlayContainer } from '@angular/cdk/overlay';
import { OrgSwitcherComponent } from './org-switcher.component';
import { OrgConnection } from '../../models/pull-request.model';

const ORG_A: OrgConnection = { organization: 'org-a', token: 'ghp_aaa' };
const ORG_B: OrgConnection = { organization: 'org-b', token: 'ghp_bbb' };

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

    it('shows a count when multiple orgs are configured', () => {
      const fixture = createFixture([ORG_A, ORG_B]);
      expect(fixture.nativeElement.textContent).toContain('2 organizations');
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

      expect(fixture.componentInstance.view()).toBe('add');
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

    it('does not emit when the draft is invalid', () => {
      const fixture = createFixture([]);
      const emitted: OrgConnection[][] = [];
      fixture.componentInstance.connectionsChange.subscribe((v: OrgConnection[]) => emitted.push(v));

      fixture.componentInstance.addConnection();

      expect(emitted).toHaveLength(0);
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
});
