/**
 * Retained executive-search firm directory (#1675) — read side.
 *
 * The directory is a small editorial list (seeded via migrations; no
 * runtime writer in the API today). We cache the WHOLE active set once
 * (one key, `retained-firms:v1:active`, 1h) and apply the optional
 * region / specialty filters in memory — equivalent to the jsonb `@>`
 * single-element containment the route used to push to SQL, and it keeps
 * the keyspace bounded regardless of query-string input.
 *
 * Any future firm writer MUST call `invalidateRetainedFirmDirectory()`.
 */

import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import type { RetainedSearchFirm } from "../../db/schema/retainedSearch.js";
import { getOrSetCached, invalidateCachedKey } from "../../utils/edge-cache.js";

const { retainedSearchFirms } = schema;

const FIRMS_CACHE_KEY = "retained-firms:v1:active";
const FIRMS_CACHE_TTL_SECONDS = 60 * 60;

export type RetainedSearchFirmDto = Omit<RetainedSearchFirm, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

function iso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

function loadActiveFirms(): Promise<RetainedSearchFirmDto[]> {
  return getOrSetCached({
    key: FIRMS_CACHE_KEY,
    ttlSeconds: FIRMS_CACHE_TTL_SECONDS,
    loader: async () => {
      const rows = await getDb()
        .select()
        .from(retainedSearchFirms)
        .where(eq(retainedSearchFirms.isActive, true))
        .orderBy(asc(retainedSearchFirms.tier), asc(retainedSearchFirms.sortOrder), asc(retainedSearchFirms.name));
      return rows.map((r) => ({ ...r, createdAt: iso(r.createdAt), updatedAt: iso(r.updatedAt) }));
    },
  });
}

/** Active firms, optionally narrowed by ISO2 region (upper-case) and/or
 *  specialty (lower-case). Empty string = no filter. */
export async function listRetainedSearchFirms(filters: {
  region: string;
  specialty: string;
}): Promise<RetainedSearchFirmDto[]> {
  const firms = await loadActiveFirms();
  return firms.filter(
    (f) =>
      (!filters.region || (f.regions ?? []).includes(filters.region)) &&
      (!filters.specialty || (f.specialties ?? []).includes(filters.specialty)),
  );
}

export function invalidateRetainedFirmDirectory(): void {
  invalidateCachedKey(FIRMS_CACHE_KEY);
}
