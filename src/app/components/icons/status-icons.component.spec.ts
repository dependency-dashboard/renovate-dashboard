import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  CheckRunConclusionIconComponent,
  CheckRunStatusIconComponent,
  CiStatusIconComponent,
} from './status-icons.component';

describe('CiStatusIconComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CiStatusIconComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  function create(status: string, label: string | null = null) {
    const fixture = TestBed.createComponent(CiStatusIconComponent);
    fixture.componentRef.setInput('status', status);
    fixture.componentRef.setInput('label', label);
    fixture.detectChanges();
    return fixture;
  }

  it('renders a distinct icon per status', () => {
    expect(create('success').nativeElement.querySelector('svg.text-emerald-500')).not.toBeNull();
    expect(create('failure').nativeElement.querySelector('svg.text-rose-500')).not.toBeNull();
    expect(create('pending').nativeElement.querySelector('svg.animate-spin')).not.toBeNull();
    expect(create('mixed').nativeElement.querySelector('svg.text-ink-3')).not.toBeNull();
    expect(create('unknown').nativeElement.querySelector('svg.text-ink-3')).not.toBeNull();
  });

  it('is an accessible image when labeled and hidden otherwise', () => {
    const labeled = create('success', 'CI status: success');
    const host = labeled.nativeElement as HTMLElement;
    expect(host.getAttribute('role')).toBe('img');
    expect(host.getAttribute('aria-label')).toBe('CI status: success');
    expect(host.getAttribute('aria-hidden')).toBeNull();

    const decorative = create('success').nativeElement as HTMLElement;
    expect(decorative.getAttribute('aria-hidden')).toBe('true');
    expect(decorative.getAttribute('role')).toBeNull();
  });
});

describe('CheckRunStatusIconComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CheckRunStatusIconComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('renders queued, in-progress, and completed variants', () => {
    for (const [status, selector] of [
      ['queued', 'svg.text-blue-400'],
      ['in_progress', 'svg.animate-spin'],
      ['completed', 'svg.text-green-400'],
    ] as const) {
      const fixture = TestBed.createComponent(CheckRunStatusIconComponent);
      fixture.componentRef.setInput('status', status);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector(selector), status).not.toBeNull();
    }
  });
});

describe('CheckRunConclusionIconComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CheckRunConclusionIconComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('groups conclusions into success / failure / neutral variants', () => {
    for (const [conclusion, selector] of [
      ['success', 'svg.text-green-500'],
      ['failure', 'svg.text-red-500'],
      ['timed_out', 'svg.text-red-500'],
      ['action_required', 'svg.text-red-500'],
      ['cancelled', 'svg.text-gray-400'],
      ['skipped', 'svg.text-gray-400'],
      ['neutral', 'svg.text-gray-400'],
    ] as const) {
      const fixture = TestBed.createComponent(CheckRunConclusionIconComponent);
      fixture.componentRef.setInput('conclusion', conclusion);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector(selector), conclusion).not.toBeNull();
    }
  });
});
