/**
 * useKitHistory — the kit's ONE Undo / Redo over every store it edits (the
 * résumé content and the pages' free elements), in time order. Each store
 * keeps its own snapshots and tells the journal when it adds a step
 * (`record`) or lets go of its history (`forget`); Undo asks the store of the
 * latest step to revert it (kit-history.ts).
 *
 * A store whose step can no longer be undone (its stack trimmed past its
 * limit) is skipped, so one Undo always reverts one real change.
 *
 * `batch(fn)` makes every store's steps inside `fn` ONE step (a media
 * drop on a résumé entry adds the element AND binds the entry): Undo /
 * Redo run each store's part of it together.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { emptyJournal, forgetSource, joinStep, recordStep, takeRedo, takeUndo, type Journal } from "./kit-history";

export type KitHistorySource = "content" | "layers";

/** What each store offers the journal: revert / reapply its latest step,
 *  false when it had none. */
export interface HistoryStore {
  undo: () => boolean;
  redo: () => boolean;
}

export function useKitHistory() {
  const [journal, setJournalState] = useState<Journal<KitHistorySource>>(emptyJournal);
  const journalRef = useRef(journal);
  const setJournal = useCallback((next: Journal<KitHistorySource>) => {
    journalRef.current = next;
    setJournalState(next);
  }, []);
  // Stores are registered after they exist (the layers come later in the kit).
  const stores = useRef<Partial<Record<KitHistorySource, HistoryStore>>>({});

  // Inside a batch: whether its first step was recorded (the rest join it).
  const batching = useRef<{ started: boolean } | null>(null);
  const record = useCallback(
    (source: KitHistorySource) => {
      const open = batching.current;
      if (open?.started) {
        setJournal(joinStep(journalRef.current, source));
        return;
      }
      if (open) open.started = true;
      setJournal(recordStep(journalRef.current, source));
    },
    [setJournal],
  );
  const batch = useCallback((fn: () => void) => {
    if (batching.current) {
      fn(); // nested: part of the outer step
      return;
    }
    batching.current = { started: false };
    try {
      fn();
    } finally {
      batching.current = null;
    }
  }, []);
  const forget = useCallback((source: KitHistorySource) => setJournal(forgetSource(journalRef.current, source)), [setJournal]);
  const register = useCallback((source: KitHistorySource, store: HistoryStore) => {
    stores.current[source] = store;
  }, []);

  const step = useCallback(
    (take: typeof takeUndo, run: (store: HistoryStore) => boolean) => {
      let j = journalRef.current;
      for (let taken = take(j); taken; taken = take(j)) {
        j = taken.next;
        // Every store of the step runs; it counts when any of them did.
        let ran = false;
        for (const source of taken.sources) {
          const store = stores.current[source];
          if (store && run(store)) ran = true;
        }
        if (ran) break;
      }
      setJournal(j);
    },
    [setJournal],
  );
  const undo = useCallback(() => step(takeUndo, (s) => s.undo()), [step]);
  const redo = useCallback(() => step(takeRedo, (s) => s.redo()), [step]);

  return useMemo(
    () => ({
      record,
      batch,
      forget,
      register,
      undo,
      redo,
      canUndo: journal.past.length > 0,
      canRedo: journal.future.length > 0,
    }),
    [record, batch, forget, register, undo, redo, journal],
  );
}
