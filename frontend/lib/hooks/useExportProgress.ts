/**
 * useExportProgress — single source of truth for the studio export %.
 *
 * Module-level pub/sub so any component can subscribe to render progress
 * without anyone in the tree threading an `exportProgress` prop. The save
 * pipeline calls `publishExportProgress(p)` from within `handleExport`'s
 * progress callback, and `<SaveButton />` (or any other consumer) reads
 * the current value via `useExportProgress()`.
 *
 * Why module-level and not React context: only ONE pipeline produces
 * progress at a time (a user is only running one export), and we don't
 * want every Studio surface that wants a peek at it to need to be wrapped
 * in a provider. `useSyncExternalStore` keeps subscribers in sync with
 * concurrent rendering.
 */

import { useSyncExternalStore } from "react";

let progress = 0;
const listeners = new Set<() => void>();

/** Set the current export progress (0..1). Idempotent — same value is a
 *  no-op so we don't fire spurious renders. */
export function publishExportProgress(next: number): void {
  if (next === progress) return;
  progress = next;
  listeners.forEach((l) => l());
}

/** Synchronous read for non-React callers (logs, telemetry). */
export function getExportProgress(): number {
  return progress;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Subscribe a component to the current export progress. Returns a value
 *  in [0, 1]; consumers format / display however they like. */
export function useExportProgress(): number {
  return useSyncExternalStore(subscribe, getExportProgress, getExportProgress);
}
