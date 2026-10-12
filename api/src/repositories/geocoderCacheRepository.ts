/**
 * GeocoderCacheRepository — pure data access for `geocoder_cache`.
 *
 * Read-through cache for the Mapbox geocoder. The wrapping logic
 * (cache key derivation, decorator pattern) lives in
 * services/adapters/cached-geocoder.ts; this file is just CRUD.
 */

import { and, eq, gt, inArray, lt, lte, sql, asc } from "drizzle-orm";
import { schema } from "../db/index.js";

const { geocoderCache } = schema;

export type DbLike = any;

export interface StaleCacheRow {
  cacheKey: string;
  result: unknown;
}

export interface IGeocoderCacheRepository {
  /**
   * Returns the cached result, or `undefined` if the key has never
   * been seen. Note: a cached *null* (Mapbox returned no match) is
   * distinct from a cache miss — the wrapper relies on this distinction
   * to short-circuit known-empty queries.
   */
  get(cacheKey: string): Promise<unknown | undefined>;

  /** Write through. UPSERT semantics — re-puts bump hit_count + last_hit_at. */
  put(cacheKey: string, result: unknown): Promise<void>;

  /** Bump hit_count + last_hit_at without rewriting the result.
   *  Called on cache hits so eviction / refresh jobs see usage signal. */
  touch(cacheKey: string): Promise<void>;

  /** Popular-but-stale rows (`last_hit_at < before AND hit_count > minHits`),
   *  oldest first — the refresh job re-geocodes these (#1161). */
  findStalePopular(before: Date, minHits: number, limit: number): Promise<StaleCacheRow[]>;

  /** Overwrite a row's result + reset last_hit_at WITHOUT bumping hit_count
   *  (a refresh is not a user hit). */
  refresh(cacheKey: string, result: unknown): Promise<void>;

  /** Batch form of `refresh`: ONE `UPDATE … FROM (VALUES …)` for many rows. */
  refreshMany(entries: Array<{ cacheKey: string; result: unknown }>): Promise<void>;

  /** LRU-evict low-traffic stale rows (`last_hit_at < before AND
   *  hit_count <= maxHits`). Returns the number deleted. */
  deleteStaleLowTraffic(before: Date, maxHits: number, limit: number): Promise<number>;
}

export class GeocoderCacheRepository implements IGeocoderCacheRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  async get(cacheKey: string): Promise<unknown | undefined> {
    const rows = (await this.db
      .select({ result: geocoderCache.result })
      .from(geocoderCache)
      .where(eq(geocoderCache.cacheKey, cacheKey))
      .limit(1)) as Array<{ result: unknown }>;
    if (rows.length === 0) return undefined;
    // Drizzle returns the jsonb value directly — even when the column is
    // null, we still return null (caller treats that as a cached negative).
    return rows[0].result;
  }

  async put(cacheKey: string, result: unknown): Promise<void> {
    await this.db
      .insert(geocoderCache)
      .values({
        cacheKey,
        result: result as any,
        hitCount: 1,
        createdAt: this.now(),
        lastHitAt: this.now(),
      })
      .onConflictDoUpdate({
        target: geocoderCache.cacheKey,
        set: {
          result: result as any,
          lastHitAt: this.now(),
          hitCount: sql`${geocoderCache.hitCount} + 1`,
        },
      });
  }

  async touch(cacheKey: string): Promise<void> {
    await this.db
      .update(geocoderCache)
      .set({
        lastHitAt: this.now(),
        hitCount: sql`${geocoderCache.hitCount} + 1`,
      })
      .where(eq(geocoderCache.cacheKey, cacheKey));
  }

  async findStalePopular(before: Date, minHits: number, limit: number): Promise<StaleCacheRow[]> {
    const rows = (await this.db
      .select({ cacheKey: geocoderCache.cacheKey, result: geocoderCache.result })
      .from(geocoderCache)
      .where(and(lt(geocoderCache.lastHitAt, before), gt(geocoderCache.hitCount, minHits)))
      .orderBy(asc(geocoderCache.lastHitAt))
      .limit(limit)) as Array<{ cacheKey: string; result: unknown }>;
    return rows;
  }

  async refresh(cacheKey: string, result: unknown): Promise<void> {
    await this.db
      .update(geocoderCache)
      .set({ result: result as any, lastHitAt: this.now() })
      .where(eq(geocoderCache.cacheKey, cacheKey));
  }

  async refreshMany(entries: Array<{ cacheKey: string; result: unknown }>): Promise<void> {
    if (entries.length === 0) return;
    // Last write wins for a duplicated key (matches sequential refresh()).
    const byKey = new Map<string, unknown>();
    for (const e of entries) byKey.set(e.cacheKey, e.result);
    const values = sql.join(
      [...byKey].map(
        ([key, result]) =>
          sql`(${key}, ${result === null || result === undefined ? null : JSON.stringify(result)}::jsonb)`,
      ),
      sql`, `,
    );
    await this.db.execute(sql`
      UPDATE ${geocoderCache} AS g
      SET result = v.result, last_hit_at = ${this.now()}
      FROM (VALUES ${values}) AS v(cache_key, result)
      WHERE g.cache_key = v.cache_key
    `);
  }

  async deleteStaleLowTraffic(before: Date, maxHits: number, limit: number): Promise<number> {
    // Two-step (select ids → delete) so we can both bound the batch and report
    // the count without relying on driver-specific affected-row semantics.
    const victims = (await this.db
      .select({ cacheKey: geocoderCache.cacheKey })
      .from(geocoderCache)
      .where(and(lt(geocoderCache.lastHitAt, before), lte(geocoderCache.hitCount, maxHits)))
      .orderBy(asc(geocoderCache.lastHitAt))
      .limit(limit)) as Array<{ cacheKey: string }>;
    if (victims.length === 0) return 0;
    await this.db
      .delete(geocoderCache)
      .where(inArray(geocoderCache.cacheKey, victims.map((v) => v.cacheKey)));
    return victims.length;
  }
}
