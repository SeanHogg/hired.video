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

export interface UseCollapsibleSectionsOptions<TId extends string = string> {
  /** When true, every section starts CLOSED. Default is open-by-default. */
  defaultClosed?: boolean;
  /** Optional localStorage key. When provided, the open-id set is
   *  restored on mount and persisted on every change so the user's
   *  collapse state survives panel unmount (tab switches) and reload. */
  storageKey?: string;
  /** Open this subset by default on first mount, even when `defaultClosed`
   *  is true. Used by surfaces that want SOME sections (e.g. Layout +
   *  Content) expanded on first paint, while everything else stays
   *  collapsed. Persisted state always wins over this. */
  initialOpen?: ReadonlySet<TId>;
  /** One-shot migration (#657): section ids to force-OPEN exactly once when
   *  `migrationVersion` advances past the version last seen in localStorage.
   *  Unlike `initialOpen` (which persisted state overrides), this is applied
   *  ON TOP of restored state — so a section whose `defaultOpen` flipped to
   *  true after users already persisted a collapsed map becomes visible once,
   *  without wiping their other collapse choices. No-op without `storageKey`. */
  migrateOpen?: ReadonlySet<TId>;
  /** Bump this whenever `migrateOpen` should re-fire. Stored per `storageKey`
   *  as `${storageKey}:mv`; the migration runs while stored < this. */
  migrationVersion?: number;
}

export function useCollapsibleSections<TId extends string>(
  ids: readonly TId[],
  opts?: UseCollapsibleSectionsOptions<TId>,
): CollapsibleSections<TId> {
  const defaultClosed = opts?.defaultClosed ?? false;
  const storageKey = opts?.storageKey;
  const initialOpen = opts?.initialOpen;
  const migrateOpen = opts?.migrateOpen;
  const migrationVersion = opts?.migrationVersion ?? 0;
  const [openIds, setOpenIds] = useState<Set<TId>>(() => {
    if (storageKey && typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed)) {
            const allowed = new Set<TId>(ids);
            const restored = new Set<TId>(
              parsed.filter((id): id is TId =>
                typeof id === "string" && allowed.has(id as TId),
              ),
            );
            // One-shot migration: force-open the `migrateOpen` ids when this
            // surface's migration version has advanced past what's stored
            // (#657). Read-only here; the `:mv` marker is written in an effect.
            if (migrateOpen && migrateOpen.size > 0) {
              const storedMv = Number(
                window.localStorage.getItem(`${storageKey}:mv`) ?? 0,
              );
              if (migrationVersion > storedMv) {
                for (const id of migrateOpen) {
                  if (allowed.has(id)) restored.add(id);
                }
              }
            }
            return restored;
          }
        }
      } catch {
        // Quota / private-mode / malformed JSON — fall through to default.
      }
    }
    if (initialOpen && initialOpen.size > 0) {
      const allowed = new Set<TId>(ids);
      return new Set<TId>([...initialOpen].filter((id) => allowed.has(id)));
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

  // Stamp the migration version once it's been applied so the one-shot
  // force-open doesn't re-fire on every mount (#657).
  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    if (!migrateOpen || migrateOpen.size === 0 || migrationVersion <= 0) return;
    try {
      const storedMv = Number(
        window.localStorage.getItem(`${storageKey}:mv`) ?? 0,
      );
      if (migrationVersion > storedMv) {
        window.localStorage.setItem(`${storageKey}:mv`, String(migrationVersion));
      }
    } catch {
      // ignore quota errors
    }
  }, [storageKey, migrateOpen, migrationVersion]);

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
