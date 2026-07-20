import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SearchFormComponent } from './search-form.component';
import { OrgConnection } from '../../models/pull-request.model';

const ORG_A: OrgConnection = { organization: 'org-a', token: 'ghp_aaa' };
const ORG_B: OrgConnection = { organization: 'org-b', token: 'ghp_bbb' };

describe('SearchFormComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SearchFormComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(SearchFormComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  describe('connections list', () => {
    it('shows each configured organization', () => {
      const fixture = TestBed.createComponent(SearchFormComponent);
      fixture.componentRef.setInput('connections', [ORG_A, ORG_B]);
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('org-a');
      expect(text).toContain('org-b');
    });

    it('hides the list when there are no connections', () => {
      const fixture = TestBed.createComponent(SearchFormComponent);
      fixture.componentRef.setInput('connections', []);
      fixture.detectChanges();

      const rows = fixture.nativeElement.querySelectorAll('[aria-label^="Remove"]');
      expect(rows.length).toBe(0);
    });

    it('emits connectionsChange without the removed org when Remove is clicked', () => {
      const fixture = TestBed.createComponent(SearchFormComponent);
      fixture.componentRef.setInput('connections', [ORG_A, ORG_B]);
      fixture.detectChanges();

      const emitted: OrgConnection[][] = [];
      fixture.componentInstance.connectionsChange.subscribe((v: OrgConnection[]) => emitted.push(v));

      const removeBtn = fixture.nativeElement.querySelector('[aria-label="Remove org-a"]') as HTMLButtonElement;
      removeBtn.click();

      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toEqual([ORG_B]);
    });
  });

  describe('add connection', () => {
    it('Add button is disabled when draft fields are empty', () => {
      const fixture = TestBed.createComponent(SearchFormComponent);
      fixture.componentRef.setInput('connections', []);
      fixture.detectChanges();

      const addBtn = fixture.nativeElement.querySelector('button[type="button"]:not([aria-label])') as HTMLButtonElement;
      expect(addBtn.disabled).toBe(true);
    });

    it('Add button is disabled when the org is already added', () => {
      const fixture = TestBed.createComponent(SearchFormComponent);
      fixture.componentRef.setInput('connections', [ORG_A]);
      fixture.componentInstance.draftOrg.set('org-a');
      fixture.componentInstance.draftToken.set('ghp_new');
      fixture.detectChanges();

      const addBtn = fixture.nativeElement.querySelector('button[type="button"]:not([aria-label])') as HTMLButtonElement;
      expect(addBtn.disabled).toBe(true);
    });

    it('shows a duplicate warning when the draft org is already configured', () => {
      const fixture = TestBed.createComponent(SearchFormComponent);
      fixture.componentRef.setInput('connections', [ORG_A]);
      fixture.componentInstance.draftOrg.set('org-a');
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Already added');
    });

    it('detects duplicates case-insensitively (GitHub orgs are case-insensitive)', () => {
      const fixture = TestBed.createComponent(SearchFormComponent);
      fixture.componentRef.setInput('connections', [ORG_A]); // 'org-a'
      fixture.componentInstance.draftOrg.set('  ORG-A  ');
      fixture.detectChanges();

      expect(fixture.componentInstance.isDuplicateOrg()).toBe(true);
      expect(fixture.componentInstance.draftValid()).toBe(false);
    });

    it('emits connectionsChange with the new connection appended when Add is clicked', () => {
      const fixture = TestBed.createComponent(SearchFormComponent);
      fixture.componentRef.setInput('connections', [ORG_A]);
      fixture.componentInstance.draftOrg.set('org-b');
      fixture.componentInstance.draftToken.set('ghp_bbb');
      fixture.detectChanges();

      const emitted: OrgConnection[][] = [];
      fixture.componentInstance.connectionsChange.subscribe((v: OrgConnection[]) => emitted.push(v));

      const addBtn = fixture.nativeElement.querySelector('button[type="button"]:not([aria-label])') as HTMLButtonElement;
      addBtn.click();

      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toEqual([ORG_A, ORG_B]);
    });

    it('clears the draft fields after a successful add', () => {
      const fixture = TestBed.createComponent(SearchFormComponent);
      fixture.componentRef.setInput('connections', []);
      fixture.componentInstance.draftOrg.set('org-a');
      fixture.componentInstance.draftToken.set('ghp_aaa');
      fixture.componentInstance.connectionsChange.subscribe((conns: OrgConnection[]) => { void conns; });

      fixture.componentInstance.addConnection();

      expect(fixture.componentInstance.draftOrg()).toBe('');
      expect(fixture.componentInstance.draftToken()).toBe('');
    });

    it('trims whitespace from draft org and token on add', () => {
      const fixture = TestBed.createComponent(SearchFormComponent);
      fixture.componentRef.setInput('connections', []);
      fixture.componentInstance.draftOrg.set('  org-a  ');
      fixture.componentInstance.draftToken.set('  ghp_aaa  ');

      const emitted: OrgConnection[][] = [];
      fixture.componentInstance.connectionsChange.subscribe((v: OrgConnection[]) => emitted.push(v));

      fixture.componentInstance.addConnection();

      expect(emitted[0]).toEqual([{ organization: 'org-a', token: 'ghp_aaa' }]);
    });
  });

  describe('submit button', () => {
    it('is disabled when formValid is false', () => {
      const fixture = TestBed.createComponent(SearchFormComponent);
      fixture.componentRef.setInput('formValid', false);
      fixture.componentRef.setInput('isLoading', false);
      fixture.detectChanges();

      const btn = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('is disabled while loading', () => {
      const fixture = TestBed.createComponent(SearchFormComponent);
      fixture.componentRef.setInput('formValid', true);
      fixture.componentRef.setInput('isLoading', true);
      fixture.detectChanges();

      const btn = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('is enabled when valid and not loading', () => {
      const fixture = TestBed.createComponent(SearchFormComponent);
      fixture.componentRef.setInput('formValid', true);
      fixture.componentRef.setInput('isLoading', false);
      fixture.detectChanges();

      const btn = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });

    it('emits searchTriggered when the form is submitted', () => {
      const fixture = TestBed.createComponent(SearchFormComponent);
      fixture.componentRef.setInput('formValid', true);
      fixture.detectChanges();

      let emitted = false;
      fixture.componentInstance.searchTriggered.subscribe(() => { emitted = true; });

      fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));

      expect(emitted).toBe(true);
    });
  });
});
