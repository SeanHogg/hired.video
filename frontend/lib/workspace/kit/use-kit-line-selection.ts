/**
 * useKitLineSelection — the kit's "which résumé line is selected" seam.
 *
 * The document stage EMITS a selection when the visitor clicks a résumé line
 * (a bullet or sentence); the "This line" inspector CONSUMES it. Both sides
 * meet here, so neither imports the other.
 *
 * The selection lives in a tiny external store. `KitLineSelectionProvider`
 * scopes one store to a workspace; without a provider the hook falls back to
 * one module-level store, so a consumer never crashes for lack of wiring.
 */
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

/** One résumé line: the section it sits in, the item (work entry, project…)
 *  when the section has items, the line's index among the NON-EMPTY text
 *  lines in that scope (page reading order — lib/build/this-line.ts, which
 *  also builds refs: `lineRefOfPath`) and its text when it was selected.
 *  `path`, when present, is the shared content path it was rendered from. */
export type KitLineRef = {
  section: string;
  itemId?: string;
  lineIndex: number;
  text: string;
  path?: string;
};

export interface KitLineSelectionStore {
  get(): KitLineRef | null;
  set(line: KitLineRef | null): void;
  subscribe(listener: () => void): () => void;
}

export function sameKitLine(a: KitLineRef | null, b: KitLineRef | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.section === b.section &&
    (a.itemId ?? null) === (b.itemId ?? null) &&
    a.lineIndex === b.lineIndex &&
    (a.path ?? null) === (b.path ?? null)
  );
}

export function createKitLineSelectionStore(initial: KitLineRef | null = null): KitLineSelectionStore {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set(line) {
      // Same line re-selected with identical text: nothing changes, nobody re-renders.
      if (sameKitLine(current, line) && current?.text === line?.text) return;
      current = line;
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const fallbackStore = createKitLineSelectionStore();
const KitLineSelectionContext = createContext<KitLineSelectionStore | null>(null);

export function KitLineSelectionProvider({
  store,
  children,
}: {
  store?: KitLineSelectionStore;
  children: ReactNode;
}) {
  const value = useMemo(() => store ?? createKitLineSelectionStore(), [store]);
  return createElement(KitLineSelectionContext.Provider, { value }, children);
}

export function useKitLineSelection(): {
  line: KitLineRef | null;
  select: (line: KitLineRef) => void;
  clear: () => void;
} {
  const store = useContext(KitLineSelectionContext) ?? fallbackStore;
  const line = useSyncExternalStore(store.subscribe, store.get, store.get);
  const select = useCallback((next: KitLineRef) => store.set(next), [store]);
  const clear = useCallback(() => store.set(null), [store]);
  return { line, select, clear };
}
