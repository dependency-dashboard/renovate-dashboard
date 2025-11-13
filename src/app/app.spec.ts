import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { getSourceRepositoryUrl } from './config/source-repository-url';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideZonelessChangeDetection()]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render title', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Renovate PR Dashboard');
  });

  it('should render GitHub link to source repository', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const expectedHref = getSourceRepositoryUrl();
    const githubLink = compiled.querySelector('a[aria-label="View source on GitHub"]');
    expect(githubLink).toBeTruthy();
    expect(githubLink?.getAttribute('href')).toBe(expectedHref);
    expect(githubLink?.getAttribute('target')).toBe('_blank');
    expect(githubLink?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(githubLink?.getAttribute('aria-label')).toBe('View source on GitHub');
  });
});
