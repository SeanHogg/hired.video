/**
 * useContentHistory — undo / redo over the kit draft.
 *
 * Every change to the draft (an AI revision from the chat, a field typed in
 * the section editor) goes through `commit`, which snapshots the content it
 * replaces. Typing is coalesced: consecutive commits that share a `group`
 * (e.g. "edit:work") inside COALESCE_MS collapse into ONE undo step, so undo
 * reverts the whole edit burst instead of one keystroke.
 *
 * The draft itself stays owned by useResumeIntake — this hook only keeps the
 * stacks and calls `apply`. A new draft (`draftKey` changes: new parse,
 * adopted résumé, Start over) clears both stacks.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ResumeContent } from "@shared/resume";

export const COALESCE_MS = 1200;
/** Bounded so a long editing session can't grow memory without limit. */
export const HISTORY_LIMIT = 50;

interface Args {
  content: ResumeContent | null;
  draftKey: unknown;
  apply: (content: ResumeContent) => void;
  /** Injectable clock for tests. */
  now?: () => number;
  /** A commit added an undo step (not coalesced into the last one) — the
   *  kit's journal (useKitHistory) records it to order Undo across stores. */
  onStep?: () => void;
  /** Both stacks were cleared (a new draft). */
  onReset?: () => void;
}

interface Stacks {
  past: ResumeContent[];
  future: ResumeContent[];
}

const EMPTY: Stacks = { past: [], future: [] };

export function useContentHistory({ content, draftKey, apply, now = Date.now, onStep, onReset }: Args) {
  const [stacks, setStacksState] = useState<Stacks>(EMPTY);
  // Mirror of the state so commit/undo/redo read the latest stacks without
  // running side effects (apply) inside a state updater.
  const stacksRef = useRef<Stacks>(EMPTY);
  const lastCommit = useRef<{ group: string; at: number } | null>(null);
  const draftRef = useRef(draftKey);
  const contentRef = useRef(content);
  contentRef.current = content;
  const listeners = useRef({ onStep, onReset });
  listeners.current = { onStep, onReset };

  const setStacks = useCallback((next: Stacks) => {
    stacksRef.current = next;
    setStacksState(next);
  }, []);

  useEffect(() => {
    if (draftRef.current === draftKey) return;
    draftRef.current = draftKey;
    lastCommit.current = null;
    setStacks(EMPTY);
    listeners.current.onReset?.();
  }, [draftKey, setStacks]);

  const commit = useCallback(
    (next: ResumeContent, group = "change") => {
      const current = contentRef.current;
      if (!current || next === current) return;
      const at = now();
      const prev = lastCommit.current;
      const coalesce = prev !== null && prev.group === group && at - prev.at < COALESCE_MS;
      lastCommit.current = { group, at };
      const s = stacksRef.current;
      setStacks({
        past: coalesce ? s.past : [...s.past, current].slice(-HISTORY_LIMIT),
        future: [],
      });
      contentRef.current = next;
      apply(next);
      if (!coalesce) listeners.current.onStep?.();
    },
    [apply, now, setStacks],
  );

  /** Revert the latest step; false when there was none. */
  const undo = useCallback((): boolean => {
    const current = contentRef.current;
    const s = stacksRef.current;
    const previous = s.past[s.past.length - 1];
    if (!current || !previous) return false;
    lastCommit.current = null;
    setStacks({ past: s.past.slice(0, -1), future: [current, ...s.future] });
    contentRef.current = previous;
    apply(previous);
    return true;
  }, [apply, setStacks]);

  /** Reapply the latest undone step; false when there was none. */
  const redo = useCallback((): boolean => {
    const current = contentRef.current;
    const s = stacksRef.current;
    const [next, ...rest] = s.future;
    if (!current || !next) return false;
    lastCommit.current = null;
    setStacks({ past: [...s.past, current].slice(-HISTORY_LIMIT), future: rest });
    contentRef.current = next;
    apply(next);
    return true;
  }, [apply, setStacks]);

  return {
    commit,
    undo,
    redo,
    canUndo: stacks.past.length > 0,
    canRedo: stacks.future.length > 0,
  };
}
