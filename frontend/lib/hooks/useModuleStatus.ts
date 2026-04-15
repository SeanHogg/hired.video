import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";

export interface ModuleStatus {
  slug: string;
  name: string;
  isActive: boolean;
}

type Listener = (map: Map<string, boolean>) => void;

let cache: Map<string, boolean> | null = null;
let inflight: Promise<Map<string, boolean>> | null = null;
const listeners = new Set<Listener>();

function notify(map: Map<string, boolean>): void {
  for (const l of listeners) l(map);
}

async function loadStatuses(): Promise<Map<string, boolean>> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = apiClient
    .get<ModuleStatus[]>("/api/modules/status")
    .then((res) => {
      const map = new Map<string, boolean>();
      for (const m of res.data ?? []) map.set(m.slug, m.isActive);
      cache = map;
      inflight = null;
      notify(map);
      return map;
    })
    .catch(() => {
      // Fail open — if the status endpoint is unreachable, don't block UI.
      const map = new Map<string, boolean>();
      cache = map;
      inflight = null;
      notify(map);
      return map;
    });
  return inflight;
}

/** Test-only: reset cache + in-flight state. */
export function __resetModuleStatusCache(): void {
  cache = null;
  inflight = null;
}

/** Invalidate the cache after an admin toggle so the next read refetches. */
export function invalidateModuleStatus(): void {
  cache = null;
  inflight = null;
}

export function useModuleStatus(): { statuses: Map<string, boolean>; loading: boolean } {
  const [statuses, setStatuses] = useState<Map<string, boolean>>(cache ?? new Map());
  const [loading, setLoading] = useState(cache === null);

  useEffect(() => {
    const listener: Listener = (map) => setStatuses(new Map(map));
    listeners.add(listener);
    if (cache === null) {
      loadStatuses().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return { statuses, loading };
}

/**
 * Returns true when the slug is active OR absent from the registry (opt-in
 * enforcement mirrors the backend). While loading, returns `undefined` so
 * callers can distinguish "unknown" from "disabled".
 */
export function useModuleActive(slug: string): { active: boolean | undefined; loading: boolean } {
  const { statuses, loading } = useModuleStatus();
  if (loading) return { active: undefined, loading: true };
  const v = statuses.get(slug);
  return { active: v === undefined ? true : v, loading: false };
}
