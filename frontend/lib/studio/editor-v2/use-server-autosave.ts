// use-server-autosave.ts — debounced, change-detected server autosave for the
// v2 Studio editor.
//
// Why: signed-in users lost in-progress work when their session expired mid-edit
// because the editor only pushed to the server on an explicit Save click (the
// localStorage autosave survives a reload, but not a logout → re-login that
// lands on a different route / a server reload that overwrites the local draft).
// Since the editor already has full undo/redo, continuously persisting is safe —
// an accidental edit is reversible, a lost session is not.
//
// Design:
//   • Debounced — coalesces a burst of edits into one write.
//   • Change-detected — `computeSnapshot()` is called ONLY inside the debounced
//     callback (never per-render) so a large CanvasState isn't serialized on
//     every keystroke; the save is skipped when the snapshot is unchanged.
//   • Re-entrant-safe — never overlaps a manual save (`isSaving`) or a prior
//     autosave still in flight; the next edit simply reschedules.
//   • Self-baselining — the first armed pass records the seeded/loaded state as
//     the baseline so opening a project never triggers a redundant write; the
//     baseline is refreshed after every successful save.
//
// The hook owns no domain logic — the caller supplies the actual `save` (the
// editor's `handleSave({ silent: true })`) and the snapshot serializer, so this
// stays a generic "persist-on-change" primitive.

import { useEffect, useRef, useState, type DependencyList } from "react";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

interface Options {
  /** Master switch — autosave is a no-op when false (e.g. signed-out visitors,
   *  who are covered by the localStorage draft + claim-on-auth flow instead). */
  enabled: boolean;
  /** Per-kind runtime is hydrated and the project finished loading. Until true
   *  the effect waits, so freshly-loaded server content is never re-saved. */
  ready: boolean;
  /** Debounce window (ms) after the last edit before a server write fires. */
  debounceMs?: number;
  /** Serialize the current content for change detection. Called only inside the
   *  debounced callback, never on render. */
  computeSnapshot: () => string;
  /** True while a manual / claim save is already running — autosave defers. */
  isSaving: boolean;
  /** The silent save. Resolves truthy on success, falsy/null on failure. */
  save: () => Promise<unknown>;
  /** Content dependencies whose change schedules an autosave (the same content
   *  slices the localStorage autosave watches). */
  deps: DependencyList;
}

/**
 * Returns the live autosave status for a "Saving… / Saved / Save failed"
 * indicator. The status is purely cosmetic — the save itself runs regardless.
 */
export function useServerAutosave({
  enabled,
  ready,
  debounceMs = 2500,
  computeSnapshot,
  isSaving,
  save,
  deps,
}: Options): { status: AutosaveStatus } {
  const [status, setStatus] = useState<AutosaveStatus>("idle");

  // Latest closures/flags live in refs so the debounced timer always reads fresh
  // values without re-subscribing the effect (and re-arming the baseline) on
  // every render.
  const saveRef = useRef(save);
  saveRef.current = save;
  const computeRef = useRef(computeSnapshot);
  computeRef.current = computeSnapshot;
  const isSavingRef = useRef(isSaving);
  isSavingRef.current = isSaving;

  const baselineRef = useRef<string | null>(null);
  const armedRef = useRef(false);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled || !ready) return;
    // First armed pass = the seeded / server-loaded mount state, not a user
    // edit. Record it as the baseline and bail so opening a project (or signing
    // in mid-session) never auto-writes unchanged content.
    if (!armedRef.current) {
      armedRef.current = true;
      baselineRef.current = computeRef.current();
      return;
    }
    const handle = window.setTimeout(async () => {
      // A manual save or a prior autosave is busy — let the next edit reschedule
      // so the two never race over the same project row.
      if (isSavingRef.current || inFlightRef.current) return;
      const snapshot = computeRef.current();
      if (snapshot === baselineRef.current) return; // nothing changed
      inFlightRef.current = true;
      setStatus("saving");
      try {
        const result = await saveRef.current();
        if (result) {
          // Re-baseline from the post-save state (entityId stamps, etc.) so the
          // settle-down render doesn't look like a fresh change.
          baselineRef.current = computeRef.current();
          setStatus("saved");
        } else {
          setStatus("error");
        }
      } catch {
        setStatus("error");
      } finally {
        inFlightRef.current = false;
      }
    }, debounceMs);
    return () => window.clearTimeout(handle);
    // The content deps drive re-scheduling; computeSnapshot/save/isSaving are
    // read through refs so they're intentionally excluded.
  }, [enabled, ready, debounceMs, ...deps]);

  return { status };
}
