import { getDb, schema } from "../../db/index.js";

export type ModuleStatus = { slug: string; name: string; isActive: boolean };

/** Narrow Deps slice. Module status is read-heavy middleware — every
 *  request on a module-gated route hits this. The cache stays at module
 *  scope (for the perf win); `deps.db` is injectable so tests can skip
 *  Postgres without plumbing through the `__set*ForTests` escape hatch. */
export interface ModuleStatusDeps {
  db: ReturnType<typeof getDb>;
}

/** NOT an eager default — tests that hit only the warmed cache should
 *  never touch `getDb()`. Each function that needs the handle resolves
 *  it lazily inside the cache-miss branch. Tests pass an explicit
 *  `deps` so the real Drizzle client is never constructed. */

// Short-lived cache — avoids hammering the DB when middleware runs on every
// module-scoped request. Cleared automatically on toggle via invalidate().
const CACHE_TTL_MS = 30_000;
let cache: { map: Map<string, boolean>; expiresAt: number } | null = null;

function now(): number {
  return Date.now();
}

export function invalidateModuleStatusCache(): void {
  cache = null;
}

async function loadStatusMap(deps: ModuleStatusDeps): Promise<Map<string, boolean>> {
  const rows = await deps.db
    .select({ slug: schema.modules.slug, isActive: schema.modules.isActive })
    .from(schema.modules);
  return new Map(rows.map((r) => [r.slug, r.isActive]));
}

export async function getModuleStatusMap(
  deps?: ModuleStatusDeps,
): Promise<Map<string, boolean>> {
  if (cache && cache.expiresAt > now()) return cache.map;
  // Lazy-resolve the handle only on cache miss.
  const resolved: ModuleStatusDeps = deps ?? { db: getDb() };
  const map = await loadStatusMap(resolved);
  cache = { map, expiresAt: now() + CACHE_TTL_MS };
  return map;
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
  cache = { map, expiresAt: now() + CACHE_TTL_MS };
}

/** Test-only: clear the cache so the next call re-reads from the DB. */
export function __clearModuleStatusCacheForTests(): void {
  cache = null;
}
