import { applyInitialTheme } from './theme-init';

function makeStorage(value: string | null): Pick<Storage, 'getItem'> {
  return { getItem: () => value };
}

function throwingStorage(): Pick<Storage, 'getItem'> {
  return {
    getItem: () => { throw new DOMException('Storage unavailable', 'SecurityError'); },
  };
}

function makeMatchMedia(prefersDark: boolean): (query: string) => Pick<MediaQueryList, 'matches'> {
  return (query: string) => ({ matches: query === '(prefers-color-scheme: dark)' ? prefersDark : false });
}

function throwingMatchMedia(): (query: string) => Pick<MediaQueryList, 'matches'> {
  return () => { throw new Error('matchMedia unavailable'); };
}

describe('applyInitialTheme', () => {
  let classes: Set<string>;
  let classList: Pick<DOMTokenList, 'add'>;

  beforeEach(() => {
    classes = new Set<string>();
    classList = { add: (c: string) => classes.add(c) };
  });

  const hasDark = () => classes.has('dark');

  describe('stored preference takes priority', () => {
    it('adds dark class when localStorage has "dark"', () => {
      applyInitialTheme(makeStorage('dark'), classList, makeMatchMedia(false));
      expect(hasDark()).toBe(true);
    });

    it('does not add dark class when localStorage has "light"', () => {
      applyInitialTheme(makeStorage('light'), classList, makeMatchMedia(true));
      expect(hasDark()).toBe(false);
    });
  });

  describe('no stored preference — falls back to system preference', () => {
    it('adds dark class when system prefers dark', () => {
      applyInitialTheme(makeStorage(null), classList, makeMatchMedia(true));
      expect(hasDark()).toBe(true);
    });

    it('does not add dark class when system prefers light', () => {
      applyInitialTheme(makeStorage(null), classList, makeMatchMedia(false));
      expect(hasDark()).toBe(false);
    });

    it('does not add dark class when matchMedia is unavailable', () => {
      applyInitialTheme(makeStorage(null), classList, null);
      expect(hasDark()).toBe(false);
    });

    it('does not add dark class when matchMedia throws', () => {
      applyInitialTheme(makeStorage(null), classList, throwingMatchMedia());
      expect(hasDark()).toBe(false);
    });
  });

  describe('localStorage unavailable — falls back to system preference', () => {
    it('adds dark class when system prefers dark', () => {
      applyInitialTheme(throwingStorage(), classList, makeMatchMedia(true));
      expect(hasDark()).toBe(true);
    });

    it('does not add dark class when system prefers light', () => {
      applyInitialTheme(throwingStorage(), classList, makeMatchMedia(false));
      expect(hasDark()).toBe(false);
    });

    it('does not add dark class when matchMedia is also unavailable', () => {
      applyInitialTheme(throwingStorage(), classList, null);
      expect(hasDark()).toBe(false);
    });

    it('does not add dark class when matchMedia throws', () => {
      applyInitialTheme(throwingStorage(), classList, throwingMatchMedia());
      expect(hasDark()).toBe(false);
    });
  });
});
