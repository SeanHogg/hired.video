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
import { useCallback, useEffect, useMemo, useState } from "react";

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
  /** Optional localStorage key. When provided, the open-id set is
   *  restored on mount and persisted on every change so the user's
   *  collapse state survives panel unmount (tab switches) and reload. */
  storageKey?: string;
}

export function useCollapsibleSections<TId extends string>(
  ids: readonly TId[],
  opts?: UseCollapsibleSectionsOptions,
): CollapsibleSections<TId> {
  const defaultClosed = opts?.defaultClosed ?? false;
  const storageKey = opts?.storageKey;
  const [openIds, setOpenIds] = useState<Set<TId>>(() => {
    if (storageKey && typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed)) {
            const allowed = new Set<TId>(ids);
            return new Set<TId>(
              parsed.filter((id): id is TId =>
                typeof id === "string" && allowed.has(id as TId),
              ),
            );
          }
        }
      } catch {
        // Quota / private-mode / malformed JSON — fall through to default.
      }
    }
    return defaultClosed ? new Set<TId>() : new Set<TId>(ids);
  });

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify([...openIds]));
    } catch {
      // ignore quota errors
    }
  }, [storageKey, openIds]);

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
