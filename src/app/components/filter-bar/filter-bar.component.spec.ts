import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FilterBarComponent } from './filter-bar.component';

describe('FilterBarComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FilterBarComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('shows the result counts', () => {
    const fixture = TestBed.createComponent(FilterBarComponent);
    fixture.componentRef.setInput('resultCount', 3);
    fixture.componentRef.setInput('totalCount', 10);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Showing 3 of 10');
  });

  it('updates searchText as the user types', () => {
    const fixture = TestBed.createComponent(FilterBarComponent);
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'ruby';
    input.dispatchEvent(new Event('input'));

    expect(fixture.componentInstance.searchText()).toBe('ruby');
  });

  it('shows a clear button only while the search box has text', () => {
    const fixture = TestBed.createComponent(FilterBarComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[aria-label="Clear search"]')).toBeNull();

    fixture.componentInstance.searchText.set('ruby');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[aria-label="Clear search"]')).not.toBeNull();
  });

  it('clears the search and refocuses the input when the clear button is clicked', () => {
    const fixture = TestBed.createComponent(FilterBarComponent);
    fixture.componentInstance.searchText.set('ruby');
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('[aria-label="Clear search"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(fixture.componentInstance.searchText()).toBe('');
    expect(fixture.nativeElement.querySelector('[aria-label="Clear search"]')).toBeNull();
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('input'));
  });

  it('sets the status when a segmented-control tab is clicked', () => {
    const fixture = TestBed.createComponent(FilterBarComponent);
    fixture.detectChanges();

    const failedTab = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      b => (b as HTMLButtonElement).textContent?.includes('Failed')) as HTMLButtonElement;
    failedTab.click();

    expect(fixture.componentInstance.status()).toBe('failure');
  });

  it('marks the active tab with aria-pressed', () => {
    const fixture = TestBed.createComponent(FilterBarComponent);
    fixture.detectChanges();

    const pressed = fixture.nativeElement.querySelectorAll('button[aria-pressed="true"]');
    expect(pressed).toHaveLength(1);
    expect(pressed[0].textContent).toContain('All');
  });

  it('updates sortBy when the select changes', () => {
    const fixture = TestBed.createComponent(FilterBarComponent);
    fixture.detectChanges();

    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    select.value = 'name';
    select.dispatchEvent(new Event('change'));

    expect(fixture.componentInstance.sortBy()).toBe('name');
  });
});
