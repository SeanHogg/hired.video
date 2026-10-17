// use-server-autosave.ts — the ONE debounced, change-detected server autosave
// every editor uses (the v2 Studio editor, the résumé workspace's row sync and
// its autosave version snapshots).
//
// Why: signed-in users lost in-progress work when their session expired mid-edit
// because the editor only pushed to the server on an explicit Save click (the
// localStorage autosave survives a reload, but not a logout → re-login that
// lands on a different route / a server reload that overwrites the local draft).
// Since the editor already has full undo/redo, continuously persisting is safe —
// an accidental edit is reversible, a lost session is not.
//
// Design:
//   • Debounced — coalesces a burst of edits into one write; `maxWaitMs`
//     still writes during non-stop typing.
//   • Change-detected — `computeSnapshot()` is called ONLY inside the debounced
//     callback (never per-render) so a large CanvasState isn't serialized on
//     every keystroke; the save is skipped when the snapshot is unchanged.
//   • Re-entrant-safe — never overlaps a manual save (`isSaving`) or a prior
//     autosave still in flight; a blocked write re-runs shortly.
//   • Self-baselining — the first armed pass records the seeded/loaded state as
//     the baseline so opening a project never triggers a redundant write
//     (`initialBaseline: null` makes the first pass count as an edit instead —
//     a restored draft); `rebaseline()` re-arms after the caller wrote the
//     document itself (created it, loaded a newer copy).
//   • Never loses work (#1991, #2242) — registered with the app-wide
//     unsaved-work registry from edit until the server accepts it (the PWA
//     update and the unload prompt wait on it); failed writes retry with
//     backoff, immediately when the browser comes back online, and — when
//     the caller describes the write (`offlineWrite`) — are kept in the
//     IndexedDB offline queue so a tab closed while offline still delivers
//     them. Leaving the tab or unmounting flushes a pending write.
//   • Multi-tab safe (#2242) — after a save the other tabs are told
//     (autosave-channel); a tab that hears another tab saved the same
//     document, or whose save is refused as stale (409 STALE_REVISION),
//     pauses and reports a `conflict` so the editor asks which copy to keep
//     (`keepMine()` overwrites; the caller loads the newer copy otherwise).
//
// The hook owns no domain logic — the caller supplies the actual `save` and the
// snapshot serializer, so this stays a generic "persist-on-change" primitive.

import { useCallback, useEffect, useRef, useState, type DependencyList } from "react";
import { STALE_REVISION_CODE } from "@shared/autosave";
import { apiServerErrorCode } from "@/lib/api-error-code";
import { setUnsavedWork, useUnsavedWorkOwner } from "@/hooks/use-unsaved-work";
import { announceAutosave, onRemoteAutosave } from "@/lib/autosave/autosave-channel";
import { isOfflineFailure, offlineSaveQueue, type QueuedWrite } from "@/lib/autosave/offline-save-queue";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";

/** Why autosave paused: this tab's save was refused as stale, or another tab
 *  saved the same document. */
export type AutosaveConflict = "stale" | "remote";

/** Wait before re-trying when a manual save / prior autosave is still running. */
const BUSY_RETRY_MS = 1_000;
/** Background retry schedule after a failed write; the last step repeats. */
const RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000] as const;

export type OfflineWrite = Omit<QueuedWrite, "key" | "queuedAt" | "attempts">;

interface Options {
  /** Master switch — autosave is a no-op when false (e.g. signed-out visitors,
   *  who are covered by the localStorage draft + claim-on-auth flow instead). */
  enabled: boolean;
  /** Per-kind runtime is hydrated and the project finished loading. Until true
   *  the effect waits, so freshly-loaded server content is never re-saved. */
  ready: boolean;
  /** Debounce window (ms) after the last edit before a server write fires. */
  debounceMs?: number;
  /** Longest an unsaved edit waits during continuous editing. */
  maxWaitMs?: number;
  /** Serialize the current content for change detection. Called only inside the
   *  debounced callback, never on render. */
  computeSnapshot: () => string;
  /** True while a manual / claim save is already running — autosave defers. */
  isSaving: boolean;
  /** The silent save. Resolves truthy on success, falsy/null on failure; throws
   *  a STALE_REVISION error when the server refused it as stale. */
  save: () => Promise<unknown>;
  /** Content dependencies whose change schedules an autosave. */
  deps: DependencyList;
  /** Baseline to start from instead of the first armed pass. `null` = no
   *  saved copy matches what's on screen, so the first pass saves. */
  initialBaseline?: string | null;
  /** The document's identity across tabs (`studio:<id>`, `resume:<id>`). Enables
   *  the cross-tab notice and the offline queue. */
  documentKey?: string | null;
  /** The write as a plain request, for the offline queue. */
  offlineWrite?: () => OfflineWrite | null;
  /** The "keep mine" save: overwrite regardless of the version token. */
  overwrite?: () => Promise<unknown>;
  /** Register with the unsaved-work registry (default true). */
  tracksUnsavedWork?: boolean;
  /** Flush a pending write on tab hide / pagehide / unmount (default true). */
  flushOnLeave?: boolean;
  /** Also flush when the window loses focus (switching to another app
   *  without hiding the tab). For long-debounce editors (default false). */
  flushOnBlur?: boolean;
}

export interface ServerAutosave {
  status: AutosaveStatus;
  conflict: AutosaveConflict | null;
  /** Keep this tab's copy: overwrite the server with it now. */
  keepMine: () => void;
  /** Close the conflict without writing (after loading the newer copy). */
  dismissConflict: () => void;
  /** Treat `snapshot` as what the server holds now (null = nothing matches). */
  rebaseline: (snapshot: string | null) => void;
}

export function isStaleRevisionError(err: unknown): boolean {
  return apiServerErrorCode(err) === STALE_REVISION_CODE;
}

export function useServerAutosave({
  enabled,
  ready,
  debounceMs = 2500,
  maxWaitMs,
  computeSnapshot,
  isSaving,
  save,
  deps,
  initialBaseline,
  documentKey = null,
  offlineWrite,
  overwrite,
  tracksUnsavedWork = true,
  flushOnLeave = true,
  flushOnBlur = false,
}: Options): ServerAutosave {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [conflict, setConflict] = useState<AutosaveConflict | null>(null);

  // Latest closures/flags live in refs so the debounced timer always reads fresh
  // values without re-subscribing the effect (and re-arming the baseline) on
  // every render.
  const saveRef = useRef(save);
  saveRef.current = save;
  const overwriteRef = useRef(overwrite);
  overwriteRef.current = overwrite;
  const computeRef = useRef(computeSnapshot);
  computeRef.current = computeSnapshot;
  const isSavingRef = useRef(isSaving);
  isSavingRef.current = isSaving;
  const offlineWriteRef = useRef(offlineWrite);
  offlineWriteRef.current = offlineWrite;
  const keyRef = useRef(documentKey);
  keyRef.current = documentKey;

  const baselineRef = useRef<string | null>(initialBaseline ?? null);
  const armedRef = useRef(initialBaseline !== undefined);
  const inFlightRef = useRef(false);
  const conflictRef = useRef<AutosaveConflict | null>(null);
  // First successful save of a new document stamps identity (entityId) on the
  // next render. Adopting that snapshot as baseline — instead of treating it
  // as an edit — stops a redundant write (#2242). Subsequent saves must not
  // swallow a real follow-up edit, so this is one-shot.
  const savedOnceRef = useRef(false);
  const settleRef = useRef(false);
  // From an edit until the server accepts it, a reload would lose work — the
  // PWA auto-update and the unload prompt wait on this (hooks/use-unsaved-work.ts).
  const unsavedOwner = useUnsavedWorkOwner();
  const markUnsaved = (dirty: boolean) => {
    if (tracksUnsavedWork) setUnsavedWork(unsavedOwner, dirty);
  };
  // One pending timer at a time: the debounce after an edit, or a retry after
  // a busy/failed attempt. A new edit replaces it.
  const timerRef = useRef<number | undefined>(undefined);
  const failuresRef = useRef(0);
  // When the oldest edit not yet written was made (for maxWaitMs).
  const firstEditAtRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
    timerRef.current = undefined;
  };
  // False once unmounted: a final flush may still run, but nothing is
  // re-scheduled for an editor that is gone (its write is in the offline
  // queue when the network was the problem).
  const aliveRef = useRef(true);
  const schedule = (delay: number) => {
    clearTimer();
    if (!aliveRef.current) return;
    timerRef.current = window.setTimeout(() => void persistRef.current(), delay);
  };
  const enterConflict = (kind: AutosaveConflict) => {
    clearTimer();
    conflictRef.current = kind;
    setConflict(kind);
    setStatus("conflict");
  };

  // The one write path (debounce, retry, flush, keep-mine). Kept in a ref so
  // timers and listeners always run the latest closure.
  const persistRef = useRef<(force?: boolean) => Promise<void>>(async () => {});
  persistRef.current = async (force = false) => {
    clearTimer();
    // Paused until the user picks a copy.
    if (conflictRef.current && !force) return;
    // A manual save or a prior autosave is busy — try again shortly so the two
    // never race over the same row, and nothing is left unsaved.
    if (isSavingRef.current || inFlightRef.current) {
      schedule(BUSY_RETRY_MS);
      return;
    }
    const snapshot = computeRef.current();
    if (!force && snapshot === baselineRef.current) {
      markUnsaved(false);
      firstEditAtRef.current = null;
      return; // nothing changed
    }
    inFlightRef.current = true;
    firstEditAtRef.current = null;
    setStatus("saving");
    let outcome: "saved" | "failed" | "stale" = "failed";
    let failure: unknown = null;
    try {
      const run = force && overwriteRef.current ? overwriteRef.current : saveRef.current;
      outcome = (await run()) ? "saved" : "failed";
    } catch (err) {
      failure = err;
      outcome = isStaleRevisionError(err) ? "stale" : "failed";
    } finally {
      inFlightRef.current = false;
    }
    const key = keyRef.current;
    if (outcome === "saved") {
      failuresRef.current = 0;
      if (key) {
        announceAutosave(key);
        void offlineSaveQueue.remove(key);
      }
      // Re-baseline from the post-save state (may already include a stamped
      // entityId if the save flushed before this continuation).
      const post = computeRef.current();
      baselineRef.current = post;
      const firstSave = !savedOnceRef.current;
      savedOnceRef.current = true;
      if (firstSave) {
        // The next deps pass is the settle-down render (entityId / project id),
        // not a user edit — adopt it as baseline instead of writing again.
        settleRef.current = true;
        // If that pass never comes (save didn't change deps), drop the flag
        // on the next macrotask so a later real edit is not swallowed.
        window.setTimeout(() => {
          settleRef.current = false;
        }, 0);
      } else if (post !== snapshot) {
        // An edit made while this write was in flight is still unsaved.
        schedule(debounceMs);
        return;
      }
      markUnsaved(false);
      setStatus("saved");
      return;
    }
    if (outcome === "stale") {
      // Another tab/device saved a newer copy: don't overwrite it silently.
      enterConflict("stale");
      return;
    }
    // Failed (offline, expired session, 5xx): keep the write in the offline
    // queue when the network is the problem, and retry in the background with
    // backoff instead of waiting for the next edit.
    setStatus("error");
    const write = key && isOfflineFailure(failure) ? offlineWriteRef.current?.() : null;
    if (key && write) void offlineSaveQueue.enqueue({ key, ...write });
    const delay = RETRY_DELAYS_MS[Math.min(failuresRef.current, RETRY_DELAYS_MS.length - 1)];
    failuresRef.current += 1;
    schedule(delay);
  };

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
    if (settleRef.current) {
      settleRef.current = false;
      baselineRef.current = computeRef.current();
      markUnsaved(false);
      return;
    }
    markUnsaved(true);
    failuresRef.current = 0;
    if (conflictRef.current) return; // paused; the edit stays unsaved
    const now = Date.now();
    if (firstEditAtRef.current === null) firstEditAtRef.current = now;
    const waited = now - firstEditAtRef.current;
    schedule(maxWaitMs === undefined ? debounceMs : Math.max(0, Math.min(debounceMs, maxWaitMs - waited)));
    // The content deps drive re-scheduling; computeSnapshot/save/isSaving are
    // read through refs so they're intentionally excluded.
  }, [enabled, ready, debounceMs, ...deps]);

  // Leaving the tab (switch, minimise, close) flushes a pending write now
  // rather than after the debounce, which may never fire; reconnecting
  // retries a failed one straight away.
  useEffect(() => {
    if (!enabled) return;
    const flush = () => {
      if (flushOnLeave && timerRef.current !== undefined) void persistRef.current();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const onOnline = () => {
      if (timerRef.current !== undefined || failuresRef.current > 0) void persistRef.current();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    window.addEventListener("online", onOnline);
    if (flushOnBlur) window.addEventListener("blur", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("online", onOnline);
      if (flushOnBlur) window.removeEventListener("blur", flush);
    };
  }, [enabled, flushOnLeave, flushOnBlur]);

  // Another tab saved this document: this copy is no longer the newest.
  // While mounted, this editor (not the global flush) owns its queued write.
  useEffect(() => {
    if (!enabled || !documentKey) return;
    const unclaim = offlineSaveQueue.claim(documentKey);
    const unsubscribe = onRemoteAutosave(documentKey, () => enterConflict("remote"));
    return () => {
      unclaim();
      unsubscribe();
    };
  }, [enabled, documentKey]);

  // Unmount (route change inside the app): send a pending write rather than
  // drop it.
  useEffect(() => {
    aliveRef.current = true; // (re-)mounted — StrictMode remounts once in dev
    return () => {
      aliveRef.current = false;
      if (flushOnLeave && timerRef.current !== undefined && !conflictRef.current) void persistRef.current();
      else clearTimer();
    };
  }, []);

  const keepMine = useCallback(() => {
    conflictRef.current = null;
    setConflict(null);
    void persistRef.current(true);
  }, []);

  const dismissConflict = useCallback(() => {
    conflictRef.current = null;
    setConflict(null);
    setStatus("saved");
  }, []);

  const rebaseline = useCallback((snapshot: string | null) => {
    armedRef.current = true;
    baselineRef.current = snapshot;
  }, []);

  return { status, conflict, keepMine, dismissConflict, rebaseline };
}
