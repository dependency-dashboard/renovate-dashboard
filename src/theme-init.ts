/**
 * Applies the correct initial theme class to the `<html>` element before
 * the framework boots, preventing a flash of unstyled content (FOUC).
 *
 * Priority:
 *  1. Stored preference in `localStorage` ('dark' | 'light')
 *  2. OS/browser preference via `matchMedia('(prefers-color-scheme: dark)')`
 *  3. Light mode (no class added)
 *
 * The inline `<script>` in `index.html` mirrors this logic verbatim so it
 * can run synchronously before any CSS paints. This function exists solely
 * so that logic can be unit-tested.
 *
 * @param storage  Defaults to `localStorage`. Override in tests.
 * @param classList  Defaults to `document.documentElement.classList`. Override in tests.
 * @param matchMedia  Defaults to `window.matchMedia`. Override in tests.
 */
export function applyInitialTheme(
  storage: Pick<Storage, 'getItem'> = localStorage,
  classList: Pick<DOMTokenList, 'add'> = document.documentElement.classList,
  matchMedia: ((query: string) => Pick<MediaQueryList, 'matches'>) | null =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? (q) => window.matchMedia(q)
      : null,
): void {
  const applyIfSystemDark = () => {
    try {
      if (matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) {
        classList.add('dark');
      }
    } catch { /* matchMedia unavailable — leave as light */ }
  };

  try {
    const theme = storage.getItem('theme');
    if (theme === 'dark') {
      classList.add('dark');
    } else if (!theme) {
      applyIfSystemDark();
    }
    // theme === 'light' → do nothing (light is the default)
  } catch {
    // localStorage unavailable — mirror the matchMedia fallback to avoid FOUC
    applyIfSystemDark();
  }
}
