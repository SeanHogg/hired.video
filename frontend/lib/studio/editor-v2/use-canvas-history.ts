/**
 * useCanvasHistory — undo/redo wrapper around `useState<CanvasState>`.
 *
 * Drop-in replacement for `useState<CanvasState>`: exposes the same
 * `(state, setState)` pair so existing mutators (`updateScene`,
 * `addScene`, `insertWidget`, …) keep calling `setState((prev) => ...)`
 * unchanged. On top of that it tracks past + future stacks so the
 * editor can offer Cmd/Ctrl+Z / Shift+Cmd+Z and visible toolbar
 * buttons.
 *
 * Coalescing: every `setState` call schedules a debounced commit
 * (`COMMIT_DEBOUNCE_MS`). Rapid bursts (e.g. dragging a widget at
 * 60fps) collapse into a single history entry — the commit fires once
 * the user stops moving. Without this, a single drag would blow
 * through the history stack in one second.
 *
 * Reset: when the editor loads a new project from the server we throw
 * the local history away — undo shouldn't take you below the
 * just-loaded state, and the prior session's stack isn't meaningful
 * against a different project.
 */
import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

const MAX_HISTORY = 100;
const COMMIT_DEBOUNCE_MS = 350;

export interface CanvasHistory<T> {
  state: T;
  setState: Dispatch<SetStateAction<T>>;
  /** Flush any uncommitted change immediately (e.g. on save). */
  commit: () => void;
  /** Replace the working state and clear past/future. Use when the
   *  editor loads a different project — local undo against the prior
   *  session's stack would be confusing. */
  reset: (next: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useCanvasHistory<T>(
  initial: T | (() => T),
): CanvasHistory<T> {
  // Resolve the (possibly lazy) initializer exactly once so we can
  // share the seed value between useState + the checkpoint ref
  // without invoking a thunk twice.
  const initRef = useRef<{ value: T } | null>(null);
  if (initRef.current === null) {
    initRef.current = {
      value:
        typeof initial === "function" ? (initial as () => T)() : initial,
    };
  }
  const [present, setPresent] = useState<T>(initRef.current.value);
  const pastRef = useRef<T[]>([]);
  const futureRef = useRef<T[]>([]);
  const checkpointRef = useRef<T>(initRef.current.value);
  const commitTimerRef = useRef<number | null>(null);
  // canUndo/canRedo derive from refs, so we need a manual bump to
  // re-render the toolbar when the stacks change.
  const [, bump] = useReducer((n: number) => n + 1, 0);

  const cancelPending = useCallback(() => {
    if (commitTimerRef.current !== null) {
      window.clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
  }, []);

  const commit = useCallback(() => {
    cancelPending();
    setPresent((curr) => {
      if (Object.is(curr, checkpointRef.current)) return curr;
      const trimmed = pastRef.current.slice(-(MAX_HISTORY - 1));
      pastRef.current = [...trimmed, checkpointRef.current];
      futureRef.current = [];
      checkpointRef.current = curr;
      bump();
      return curr;
    });
  }, [cancelPending]);

  const setState = useCallback<Dispatch<SetStateAction<T>>>(
    (updater) => {
      setPresent((prev) => {
        const next =
          typeof updater === "function"
            ? (updater as (p: T) => T)(prev)
            : updater;
        if (Object.is(next, prev)) return prev;
        cancelPending();
        commitTimerRef.current = window.setTimeout(commit, COMMIT_DEBOUNCE_MS);
        return next;
      });
    },
    [cancelPending, commit],
  );

  const undo = useCallback(() => {
    cancelPending();
    setPresent((curr) => {
      // Uncommitted edits land first — undoing them restores the last
      // checkpoint without consuming a past entry.
      if (!Object.is(curr, checkpointRef.current)) {
        futureRef.current = [curr, ...futureRef.current];
        const restored = checkpointRef.current;
        bump();
        return restored;
      }
      if (pastRef.current.length === 0) return curr;
      const prev = pastRef.current[pastRef.current.length - 1];
      pastRef.current = pastRef.current.slice(0, -1);
      futureRef.current = [curr, ...futureRef.current];
      checkpointRef.current = prev;
      bump();
      return prev;
    });
  }, [cancelPending]);

  const redo = useCallback(() => {
    cancelPending();
    setPresent((curr) => {
      if (futureRef.current.length === 0) return curr;
      const next = futureRef.current[0];
      futureRef.current = futureRef.current.slice(1);
      const trimmed = pastRef.current.slice(-(MAX_HISTORY - 1));
      pastRef.current = [...trimmed, curr];
      checkpointRef.current = next;
      bump();
      return next;
    });
  }, [cancelPending]);

  const reset = useCallback(
    (next: T) => {
      cancelPending();
      pastRef.current = [];
      futureRef.current = [];
      checkpointRef.current = next;
      setPresent(next);
      bump();
    },
    [cancelPending],
  );

  // Flush any pending commit on unmount so we don't leak the timer.
  useEffect(() => () => cancelPending(), [cancelPending]);

  return {
    state: present,
    setState,
    commit,
    reset,
    undo,
    redo,
    canUndo:
      pastRef.current.length > 0 ||
      !Object.is(present, checkpointRef.current),
    canRedo: futureRef.current.length > 0,
  };
}
