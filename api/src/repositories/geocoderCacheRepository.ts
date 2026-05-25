/**
 * GeocoderCacheRepository — pure data access for `geocoder_cache`.
 *
 * Read-through cache for the Mapbox geocoder. The wrapping logic
 * (cache key derivation, decorator pattern) lives in
 * services/adapters/cached-geocoder.ts; this file is just CRUD.
 */

import { eq, sql } from "drizzle-orm";
import { schema } from "../db/index.js";

const { geocoderCache } = schema;

export type DbLike = any;

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
}
