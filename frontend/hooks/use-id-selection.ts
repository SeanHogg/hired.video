/**
 * useIdSelection — the ONE multi-select state for list/table surfaces
 * (checkbox per row + header "select all visible" + bulk actions).
 *
 * Holds a Set of selected ids and derives the header checkbox state for
 * whatever slice is currently visible (a paginated page, a filtered list),
 * so callers never hand-roll `every(...)` / `some(...)` again. Pass
 * `resetKeys` to clear the selection when the visible scope changes
 * (page, search, filters) — the same "clear on scope change" rule every
 * bulk surface follows.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

export type HeaderCheckState = boolean | "indeterminate";

export interface IdSelection {
  /** Selected ids, in insertion (selection) order. */
  ids: string[];
  size: number;
  isSelected: (id: string) => boolean;
  toggle: (id: string, checked: boolean) => void;
  /** Add or remove every id in `ids` at once (header "select all"). */
  setMany: (ids: readonly string[], checked: boolean) => void;
  /** Header checkbox state for the given visible slice. */
  headerState: (visibleIds: readonly string[]) => HeaderCheckState;
  /** Drop specific ids (e.g. after they were deleted). */
  remove: (ids: readonly string[]) => void;
  clear: () => void;
}

export function useIdSelection(resetKeys: readonly unknown[] = []): IdSelection {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  // Clear when the caller's visible scope changes.
  useEffect(() => {
    setSelected(new Set());
  }, resetKeys);

  const toggle = useCallback((id: string, checked: boolean) => {
    setSelected((prev) => {
      if (prev.has(id) === checked) return prev;
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const setMany = useCallback((ids: readonly string[], checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const remove = useCallback((ids: readonly string[]) => setMany(ids, false), [setMany]);
  const clear = useCallback(() => setSelected(new Set()), []);

  return useMemo<IdSelection>(() => {
    const isSelected = (id: string) => selected.has(id);
    return {
      ids: Array.from(selected),
      size: selected.size,
      isSelected,
      toggle,
      setMany,
      headerState: (visibleIds) => {
        if (visibleIds.length === 0) return false;
        const count = visibleIds.filter(isSelected).length;
        if (count === 0) return false;
        return count === visibleIds.length ? true : "indeterminate";
      },
      remove,
      clear,
    };
  }, [selected, toggle, setMany, remove, clear]);
}
