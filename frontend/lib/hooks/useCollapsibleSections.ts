/**
 * useCollapsibleSections — shared multi-open accordion state for any
 * panel that hosts a list of collapsible sections. Used by the v2 left
 * rail panels (Widgets / Design / Actions) so all three behave
 * identically: every section opens/closes independently, multiple
 * sections can be open at once, and the default state is "all open"
 * (so users see every option on first paint).
 *
 * Per the standing DRY rule: every consumer mounts THIS hook. No
 * caller re-implements the Set<id>-with-toggle-pattern.
 */
import { useCallback, useMemo, useState } from "react";

export interface CollapsibleSections<TId extends string> {
  /** True when the section is expanded. */
  isOpen: (id: TId) => boolean;
  /** Flip the section's open/closed state. */
  toggle: (id: TId) => void;
  /** Force a specific state — used when programmatic callers (e.g.
   *  click-to-focus a section) want to ensure it's expanded. */
  setOpen: (id: TId, next: boolean) => void;
  /** Set of currently-open ids. Exposed for consumers that need to
   *  render a "collapse all / expand all" affordance. */
  openIds: ReadonlySet<TId>;
}

export interface UseCollapsibleSectionsOptions {
  /** When true, every section starts CLOSED. Default is open-by-default. */
  defaultClosed?: boolean;
}

export function useCollapsibleSections<TId extends string>(
  ids: readonly TId[],
  opts?: UseCollapsibleSectionsOptions,
): CollapsibleSections<TId> {
  const defaultClosed = opts?.defaultClosed ?? false;
  const [openIds, setOpenIds] = useState<Set<TId>>(
    () => (defaultClosed ? new Set<TId>() : new Set<TId>(ids)),
  );

  const isOpen = useCallback((id: TId) => openIds.has(id), [openIds]);
  const toggle = useCallback((id: TId) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const setOpen = useCallback((id: TId, next: boolean) => {
    setOpenIds((prev) => {
      if (prev.has(id) === next) return prev;
      const out = new Set(prev);
      if (next) out.add(id);
      else out.delete(id);
      return out;
    });
  }, []);

  return useMemo(
    () => ({ isOpen, toggle, setOpen, openIds }),
    [isOpen, toggle, setOpen, openIds],
  );
}
