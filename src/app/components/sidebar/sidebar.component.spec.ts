import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SidebarComponent } from './sidebar.component';

describe('SidebarComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SidebarComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('renders the brand and navigation', () => {
    const fixture = TestBed.createComponent(SidebarComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Renovate Dashboard');
    expect(fixture.nativeElement.textContent).toContain('Overview');
  });

  it('shows the group-count badge only when groups exist', () => {
    const fixture = TestBed.createComponent(SidebarComponent);
    fixture.componentRef.setInput('groupCount', 0);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('nav .tabular-nums')).toBeNull();

    fixture.componentRef.setInput('groupCount', 7);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('nav .tabular-nums')?.textContent).toContain('7');
  });

  it('is off-canvas until mobileOpen is set', () => {
    const fixture = TestBed.createComponent(SidebarComponent);
    fixture.componentRef.setInput('mobileOpen', false);
    fixture.detectChanges();
    const aside = fixture.nativeElement.querySelector('aside') as HTMLElement;
    expect(aside.classList.contains('-translate-x-full')).toBe(true);

    fixture.componentRef.setInput('mobileOpen', true);
    fixture.detectChanges();
    expect(aside.classList.contains('-translate-x-full')).toBe(false);
  });
});
