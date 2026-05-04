// Per-section collapse coordination. Lives at the BaseSectionCard level so
// the card's "Collapse all / Expand all" toggle and each BaseSectionItem's
// per-row chevron share a single source of truth — no prop-drilling of
// `isCollapsed` booleans through every section editor.
//
// Items self-register their id on mount; the toggle button self-gates
// (returns null when fewer than 2 items are registered, or when used
// outside a CollapseProvider).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";

interface CollapseApi {
  isCollapsed: (id: string) => boolean;
  toggle: (id: string) => void;
  registerId: (id: string) => () => void;
  total: number;
  collapsedCount: number;
  collapseAll: () => void;
  expandAll: () => void;
}

const CollapseCtx = createContext<CollapseApi | null>(null);

export function CollapseProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [registered, setRegistered] = useState<Set<string>>(new Set());
  // Refcount per id so two items briefly sharing an id during a re-render
  // (or a remount) don't drop the registration prematurely.
  const refcounts = useRef<Map<string, number>>(new Map());

  const registerId = useCallback((id: string) => {
    const counts = refcounts.current;
    counts.set(id, (counts.get(id) ?? 0) + 1);
    if (counts.get(id) === 1) {
      setRegistered((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    }
    return () => {
      const n = (counts.get(id) ?? 1) - 1;
      if (n <= 0) {
        counts.delete(id);
        setRegistered((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        // Drop any stale collapsed state for the removed item so the
        // collapsed-count stays in sync with the visible items.
        setCollapsed((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } else {
        counts.set(id, n);
      }
    };
  }, []);

  const api = useMemo<CollapseApi>(
    () => ({
      isCollapsed: (id) => collapsed.has(id),
      toggle: (id) =>
        setCollapsed((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }),
      registerId,
      total: registered.size,
      collapsedCount: collapsed.size,
      collapseAll: () => setCollapsed(new Set(registered)),
      expandAll: () => setCollapsed(new Set()),
    }),
    [collapsed, registered, registerId],
  );

  return <CollapseCtx.Provider value={api}>{children}</CollapseCtx.Provider>;
}

/**
 * Bind a section item to its collapse slot. Returns null when the item
 * has no id, or when used outside a CollapseProvider — callers can render
 * the chevron unconditionally and let this hook decide.
 *
 * Effect depends on `registerId` (stable across renders via
 * `useCallback([])`) rather than the whole `ctx` object. Without this,
 * every toggle rebuilt the `api` memo (because `collapsed`/`registered`
 * are in its deps), which made `ctx` change identity, which fired this
 * effect's cleanup — and the cleanup decremented the refcount to 0 and
 * wiped the id from the `collapsed` set. End result: clicking a chevron
 * collapsed the row and immediately uncollapsed it. The 2026-05-04 bug
 * the user reported as "the collapse forces the content open."
 */
export function useCollapseSlot(id: string | undefined) {
  const ctx = useContext(CollapseCtx);
  const register = ctx?.registerId;
  useEffect(() => {
    if (!register || !id) return;
    return register(id);
  }, [register, id]);
  if (!ctx || !id) return null;
  return {
    isCollapsed: ctx.isCollapsed(id),
    toggle: () => ctx.toggle(id),
  };
}

/**
 * Self-gating "Collapse all / Expand all" button. Renders null outside a
 * CollapseProvider, and when fewer than 2 items are registered (a single
 * row doesn't benefit from a bulk toggle).
 */
export function CollapseAllToggle() {
  const ctx = useContext(CollapseCtx);
  if (!ctx) return null;
  if (ctx.total < 2) return null;
  const allCollapsed = ctx.collapsedCount >= ctx.total;
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => (allCollapsed ? ctx.expandAll() : ctx.collapseAll())}
    >
      {allCollapsed ? "Expand all" : "Collapse all"}
    </Button>
  );
}
