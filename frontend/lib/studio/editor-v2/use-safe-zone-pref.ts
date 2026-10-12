/**
 * useSafeZonePreference — shared, cross-component toggle for whether the
 * V2 authoring canvas draws SafeZoneOverlay guides (#855).
 *
 * The guides are an editor affordance some users find noisy. The toggle
 * checkbox (canvas-format inspector section) and the consumer
 * (SafeZoneOverlay, mounted in CanvasStage) live in different component
 * trees, so the on/off state lives in localStorage and is read through
 * this one hook via `useSyncExternalStore` — both sides re-render in
 * lockstep when it flips, with no prop-drilling. Per the DRY rule the
 * preference key + default live here once; consumers never touch
 * localStorage directly.
 *
 * Default: guides ON (preserves today's always-on behaviour).
 */

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "studio.v2.showSafeZones";

function read(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === null ? true : raw === "1";
  } catch {
    return true;
  }
}

const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useSafeZonePreference(): [boolean, (next: boolean) => void] {
  const value = useSyncExternalStore(subscribe, read, () => true);
  const setValue = useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* ignore quota / privacy-mode failures — falls back to default */
    }
    listeners.forEach((l) => l());
  }, []);
  return [value, setValue];
}
