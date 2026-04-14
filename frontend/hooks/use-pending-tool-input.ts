import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

/**
 * Preserves a tool page's form state across an anonymous → authenticated
 * round-trip via the AuthOverlay.
 *
 * Flow:
 *   1. User fills a tool's form while signed out.
 *   2. Tool calls `snapshot(state)` the moment it decides to show the
 *      overlay — the state is written to sessionStorage under a key
 *      derived from the current pathname.
 *   3. AuthOverlay links to `/login?redirect=<pathname>`. After
 *      authentication, Login navigates back.
 *   4. On mount the hook detects a saved snapshot, hands it back via
 *      `restored`, and the tool hydrates its form state.
 *   5. After successful API submission the tool calls `clear()` so the
 *      snapshot is not replayed on subsequent visits.
 *
 * sessionStorage (not localStorage) is intentional — the recovery window
 * is the current tab session, after which the snapshot expires naturally.
 */
export interface UsePendingToolInputOptions {
  /**
   * Optional namespace override. Defaults to the current pathname, which
   * works for one-form-per-page tools. Provide a stable string if the
   * same page hosts multiple independent forms.
   */
  key?: string;
  /**
   * If true, the hook auto-restores on mount. Defaults to true.
   */
  autoRestore?: boolean;
}

const STORAGE_PREFIX = "hired:pending-tool-input:";

function storageKey(ns: string) {
  return `${STORAGE_PREFIX}${ns}`;
}

export function usePendingToolInput<T>(options: UsePendingToolInputOptions = {}) {
  const { pathname } = useLocation();
  const ns = options.key ?? pathname;
  const autoRestore = options.autoRestore ?? true;
  const [restored, setRestored] = useState<T | null>(null);
  const hasRestoredRef = useRef(false);

  useEffect(() => {
    if (!autoRestore || hasRestoredRef.current) return;
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(storageKey(ns));
      if (!raw) return;
      const parsed = JSON.parse(raw) as { value: T; savedAt: number };
      // Drop snapshots older than 1 hour — the user has clearly moved on.
      if (Date.now() - parsed.savedAt > 60 * 60 * 1000) {
        window.sessionStorage.removeItem(storageKey(ns));
        return;
      }
      setRestored(parsed.value);
      hasRestoredRef.current = true;
    } catch {
      // Malformed snapshot — discard silently.
      try { window.sessionStorage.removeItem(storageKey(ns)); } catch { /* ignore */ }
    }
  }, [ns, autoRestore]);

  const snapshot = useCallback(
    (value: T) => {
      if (typeof window === "undefined") return;
      try {
        window.sessionStorage.setItem(
          storageKey(ns),
          JSON.stringify({ value, savedAt: Date.now() }),
        );
      } catch {
        /* quota exceeded / serialization failed — best-effort only */
      }
    },
    [ns],
  );

  const clear = useCallback(() => {
    if (typeof window === "undefined") return;
    try { window.sessionStorage.removeItem(storageKey(ns)); } catch { /* ignore */ }
    setRestored(null);
    hasRestoredRef.current = false;
  }, [ns]);

  return { restored, snapshot, clear };
}
