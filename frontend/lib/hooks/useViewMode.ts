import { useCallback, useState } from "react";

/**
 * Layout modes a browse surface can offer. `grid` + `list` are the legacy
 * pair (every existing consumer); `scroll` (a horizontal carousel) and
 * `table` (a dense rows-and-columns view) were added for the Studio landing
 * and are opt-in per surface via the `modes` prop. Widening the union is
 * back-compat: a consumer that only handles "grid" | "list" keeps working.
 */
export type ViewMode = "scroll" | "grid" | "table" | "list";

const STORAGE_PREFIX = "viewmode.";

/**
 * localStorage-backed layout-mode state for a browse surface. Pairs with
 * `<ViewModeToggle>` so a user's Scroll/Grid/Table/List choice survives
 * reloads and navigations.
 *
 * The stored value is validated against the surface's allowed `modes` on
 * read — a persisted mode the surface no longer offers (or a corrupt value)
 * falls back to `fallback` rather than rendering nothing.
 *
 * @param key      stable per-surface key (namespaced under `viewmode.`)
 * @param fallback default mode when nothing valid is stored
 * @param modes    the modes this surface offers (the validation allow-list)
 */
export function useViewMode(
  key: string,
  fallback: ViewMode,
  modes: ViewMode[],
): [ViewMode, (next: ViewMode) => void] {
  const storageKey = STORAGE_PREFIX + key;
  const [mode, setMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return fallback;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw && modes.includes(raw as ViewMode)) return raw as ViewMode;
    } catch {
      // private mode / quota — fall through to the default.
    }
    return fallback;
  });

  const set = useCallback(
    (next: ViewMode) => {
      setMode(next);
      try {
        window.localStorage.setItem(storageKey, next);
      } catch {
        // ignore persistence failures — in-memory state still updates.
      }
    },
    [storageKey],
  );

  return [mode, set];
}
