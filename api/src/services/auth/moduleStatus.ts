import { getDb, schema } from "../../db/index.js";
import { getOrSetCached, invalidateCachedKey } from "../../utils/edge-cache.js";

export type ModuleStatus = { slug: string; name: string; isActive: boolean };

/** Narrow Deps slice. Module status is read-heavy middleware — every
 *  request on a module-gated route hits this. The cache stays at module
 *  scope (for the perf win); `deps.db` is injectable so tests can skip
 *  Postgres without plumbing through the `__set*ForTests` escape hatch. */
export interface ModuleStatusDeps {
  db: ReturnType<typeof getDb>;
}

/** NOT an eager default — tests that hit only the warmed cache should
 *  never touch `getDb()`. The handle is resolved lazily inside the
 *  cache-miss loader. */

// Read-heavy: the path gate consults this on every module-scoped /api
// request. Served through the canonical L1+KV cache so an admin toggle
// (which calls `invalidateModuleStatusCache`) propagates across isolates
// via KV instead of waiting out a per-isolate Map TTL.
const CACHE_KEY = "modules:status:v1";
// 3600s: the admin toggle invalidates (adminModules.ts) — every write path invalidates explicitly; long TTL = few KV refills.
const CACHE_TTL_SECONDS = 3600;

/** Test override — when set, returned instead of the cache/DB. */
let _testMap: Map<string, boolean> | null = null;

export function invalidateModuleStatusCache(): void {
  _testMap = null;
  invalidateCachedKey(CACHE_KEY);
}

async function loadStatusRecord(deps: ModuleStatusDeps): Promise<Record<string, boolean>> {
  const rows = await deps.db
    .select({ slug: schema.modules.slug, isActive: schema.modules.isActive })
    .from(schema.modules);
  return Object.fromEntries(rows.map((r) => [r.slug, r.isActive]));
}

export async function getModuleStatusMap(
  deps?: ModuleStatusDeps,
): Promise<Map<string, boolean>> {
  if (_testMap) return _testMap;
  const record = await getOrSetCached<Record<string, boolean>>({
    key: CACHE_KEY,
    ttlSeconds: CACHE_TTL_SECONDS,
    loader: () => loadStatusRecord(deps ?? { db: getDb() }),
  });
  return new Map(Object.entries(record));
}

/**
 * Returns true when the module is active OR when no row exists for that slug.
 * Rationale: opt-in enforcement — a slug the admin hasn't curated defaults to
 * "available" so routes aren't accidentally blocked before seeding.
 */
export async function isModuleActive(
  slug: string,
  deps?: ModuleStatusDeps,
): Promise<boolean> {
  const map = await getModuleStatusMap(deps);
  const v = map.get(slug);
  return v === undefined ? true : v;
}

export async function listAllModuleStatuses(
  deps?: ModuleStatusDeps,
): Promise<ModuleStatus[]> {
  const resolved: ModuleStatusDeps = deps ?? { db: getDb() };
  const rows = await resolved.db
    .select({
      slug: schema.modules.slug,
      name: schema.modules.name,
      isActive: schema.modules.isActive,
    })
    .from(schema.modules);
  return rows;
}

/** Test-only: inject a deterministic map so middleware tests don't need a DB. */
export function __setModuleStatusCacheForTests(map: Map<string, boolean>): void {
  _testMap = map;
}

/** Test-only: clear the override + cache so the next call re-reads. */
export function __clearModuleStatusCacheForTests(): void {
  invalidateModuleStatusCache();
}
