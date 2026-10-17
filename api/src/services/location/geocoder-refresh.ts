/**
 * Geocoder cache refresh + eviction (#1161). The `geocoder_cache` is
 * write-once with no TTL, so a place that gets renamed (city merges, country
 * code changes) or gains new postcodes keeps serving a stale Mapbox result
 * forever. This nightly sweep:
 *
 *   1. Re-geocodes POPULAR-but-STALE rows (last_hit_at older than the window
 *      AND hit_count above the floor) by re-running the original query through
 *      a RAW (un-cached) Mapbox client and overwriting the cached result.
 *   2. LRU-EVICTS low-traffic stale rows so the table doesn't grow without
 *      bound — they'll just be re-fetched on the next miss.
 *
 * Rate-limited by a hard per-run batch cap so it stays inside the Mapbox free
 * tier even on a large cache. No-ops when no Mapbox token is configured (the
 * stub geocoder can't refresh anything).
 */

import { buildMapboxGeocoder, type GeocoderPort } from "../adapters/mapbox.js";
import type { IGeocoderCacheRepository } from "../../repositories/geocoderCacheRepository.js";
import { logger } from "../../lib/logger.js";

export interface GeocoderRefreshDeps {
  repo: IGeocoderCacheRepository;
  /** Raw (un-cached) geocoder — null when no provider token is configured. */
  rawGeocoder: GeocoderPort | null;
  now: () => Date;
}

export interface GeocoderRefreshOptions {
  /** Rows whose last_hit_at is older than this many days are stale. */
  staleDays?: number;
  /** Only refresh rows with more than this many hits (popular). */
  popularHits?: number;
  /** Max rows to re-geocode per run (Mapbox rate budget). */
  refreshLimit?: number;
  /** Max low-traffic stale rows to evict per run. */
  evictLimit?: number;
}

export interface GeocoderRefreshResult {
  refreshed: number;
  evicted: number;
  skipped: boolean;
}

/** Recover the original forward-geocode query + country bias from a cache key
 *  (`fwd:<query>|<ISO2>`). Returns null for reverse keys / malformed keys. */
export function parseForwardKey(cacheKey: string): { query: string; countryIso2?: string } | null {
  if (!cacheKey.startsWith("fwd:")) return null;
  const body = cacheKey.slice(4);
  const pipe = body.lastIndexOf("|");
  if (pipe === -1) return null;
  const query = body.slice(0, pipe);
  const country = body.slice(pipe + 1);
  if (!query) return null;
  return { query, countryIso2: country || undefined };
}

export function buildGeocoderRefreshDeps(
  env: Record<string, string | undefined>,
  repo: IGeocoderCacheRepository,
): GeocoderRefreshDeps {
  const hasToken = !!(env.MAPBOX_TOKEN || env.MAPBOX_ACCESS_TOKEN);
  return {
    repo,
    rawGeocoder: hasToken ? buildMapboxGeocoder(env) : null,
    now: () => new Date(),
  };
}

export async function runGeocoderRefresh(
  deps: GeocoderRefreshDeps,
  opts: GeocoderRefreshOptions = {},
): Promise<GeocoderRefreshResult> {
  const staleDays = opts.staleDays ?? 90;
  const popularHits = opts.popularHits ?? 5;
  const refreshLimit = opts.refreshLimit ?? 50;
  const evictLimit = opts.evictLimit ?? 200;

  // Without a live geocoder we can't re-query — skip refresh, but still evict.
  if (!deps.rawGeocoder || !deps.rawGeocoder.isLive()) {
    const before = new Date(deps.now().getTime() - staleDays * 24 * 60 * 60 * 1000);
    const evicted = await deps.repo.deleteStaleLowTraffic(before, popularHits, evictLimit);
    return { refreshed: 0, evicted, skipped: true };
  }

  const before = new Date(deps.now().getTime() - staleDays * 24 * 60 * 60 * 1000);
  const stale = await deps.repo.findStalePopular(before, popularHits, refreshLimit);

  // Mapbox calls stay per row (each is its own rate-limited request); the
  // cache writes land in ONE batched UPDATE instead of one per row.
  const fresh: Array<{ cacheKey: string; result: unknown }> = [];
  for (const row of stale) {
    const parsed = parseForwardKey(row.cacheKey);
    if (!parsed) continue; // reverse keys aren't re-geocoded by this pass
    try {
      const result = await deps.rawGeocoder.forward(parsed.query, {
        countryIso2: parsed.countryIso2,
      });
      fresh.push({ cacheKey: row.cacheKey, result });
    } catch (err) {
      logger.error("[geocoder-refresh] re-geocode failed", { cacheKey: row.cacheKey, error: err });
    }
  }

  let refreshed = 0;
  if (fresh.length > 0) {
    try {
      await deps.repo.refreshMany(fresh);
      refreshed = fresh.length;
    } catch (err) {
      // Batch write failed — fall back to per-row writes so one bad row
      // can't discard the rest (the original per-row isolation).
      logger.error("[geocoder-refresh] batch refresh failed; retrying per row", err);
      for (const entry of fresh) {
        try {
          await deps.repo.refresh(entry.cacheKey, entry.result);
          refreshed++;
        } catch (rowErr) {
          logger.error("[geocoder-refresh] refresh failed", { cacheKey: entry.cacheKey, error: rowErr });
        }
      }
    }
  }

  // LRU-evict the long tail (stale + low traffic): `hit_count <= popularHits`.
  const evicted = await deps.repo.deleteStaleLowTraffic(before, popularHits, evictLimit);

  return { refreshed, evicted, skipped: false };
}
