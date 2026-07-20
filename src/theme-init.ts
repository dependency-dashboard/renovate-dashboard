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
 * Defaults are resolved lazily from `globalThis` inside the function (not in
 * the parameter list) so that calling it in a non-browser context — where
 * `localStorage`/`document`/`window` are absent — degrades gracefully instead
 * of throwing a `ReferenceError` before the fault-tolerant body runs, mirroring
 * the inline script's behaviour.
 *
 * @param storage  Defaults to `globalThis.localStorage` when available. Override in tests.
 * @param classList  Defaults to `document.documentElement.classList` when available. Override in tests.
 * @param matchMedia  Defaults to `window.matchMedia` when available. Pass `null` to disable; override in tests.
 */
export function applyInitialTheme(
  storage?: Pick<Storage, 'getItem'>,
  classList?: Pick<DOMTokenList, 'add'>,
  matchMedia?: ((query: string) => Pick<MediaQueryList, 'matches'>) | null,
): void {
  const hasGlobal = typeof globalThis !== 'undefined';

  const resolvedClassList =
    classList ?? (hasGlobal ? globalThis.document?.documentElement?.classList : undefined);

  const resolvedMatchMedia =
    matchMedia !== undefined
      ? matchMedia
      : hasGlobal && typeof globalThis.window?.matchMedia === 'function'
        ? (q: string) => globalThis.window.matchMedia(q)
        : null;

  const applyIfSystemDark = () => {
    try {
      if (
        resolvedClassList &&
        resolvedMatchMedia &&
        resolvedMatchMedia('(prefers-color-scheme: dark)').matches
      ) {
        resolvedClassList.add('dark');
      }
    } catch { /* matchMedia unavailable — leave as light */ }
  };

  try {
    // Reading `globalThis.localStorage` — not just calling `getItem` — can throw
    // in storage-blocked environments, so resolve and access it inside the try to
    // mirror the inline index.html script.
    const resolvedStorage =
      storage ?? (hasGlobal && 'localStorage' in globalThis ? globalThis.localStorage : undefined);
    const theme = resolvedStorage?.getItem('theme');
    if (theme === 'dark') {
      resolvedClassList?.add('dark');
    } else if (!theme) {
      applyIfSystemDark();
    }
    // theme === 'light' → do nothing (light is the default)
  } catch {
    // localStorage unavailable — mirror the matchMedia fallback to avoid FOUC
    applyIfSystemDark();
  }
}
