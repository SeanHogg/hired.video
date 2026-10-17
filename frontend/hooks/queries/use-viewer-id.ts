import { useAuth } from "@/lib/auth";

/** The signed-in viewer's user id (the effective/impersonated identity), or
 *  null when signed out. Every user-scoped query key carries it so a
 *  SuperAdmin impersonation or an account switch never reads another
 *  identity's cached rows. */
export function useViewerId(): string | null {
  const { user } = useAuth();
  return user?.id ?? null;
}

/** These rows change through many write paths (upload, create, delete,
 *  master flip, publish…) that don't all invalidate the cache, and the call
 *  sites they replace fetched on every mount. So each mount re-reads in the
 *  background while serving the cached rows at once; concurrent mounts still
 *  collapse onto one request. */
export const REREAD_ON_MOUNT = 0;

/** Option bag shared by the viewer-scoped list hooks: callers can further
 *  gate the fetch (e.g. only when a "resume" source tab is open). */
export interface ViewerQueryOptions {
  enabled?: boolean;
}

/** Option bag for the by-id hooks. `staleTime` overrides the client default
 *  (re-read on mount) for surfaces that can tolerate older rows. */
export interface ByIdQueryOptions {
  enabled?: boolean;
  staleTime?: number;
  /** Keep showing the previous id's row while the next one loads. */
  keepPrevious?: boolean;
}
