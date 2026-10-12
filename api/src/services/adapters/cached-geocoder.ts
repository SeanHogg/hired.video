/**
 * CachedGeocoder — read-through cache wrapper around any `GeocoderPort`.
 *
 * Hot path:
 *   forward("seattle")
 *     ├── SELECT result FROM geocoder_cache WHERE cache_key = 'fwd:seattle|'
 *     │   ├── hit  → return cached GeocoderPlace[], bump hit_count
 *     │   └── miss → call inner.forward() → write through, return
 *
 * Decorator pattern so every consumer that depends on `GeocoderPort`
 * gets caching transparently — no changes to LocationService, no changes
 * to the /api/locations routes. The cache layer is wired in apiDeps.ts
 * so the entire app benefits from one place.
 *
 * Negative results (Mapbox returned nothing) are cached too. A user
 * typoing "asdfqwer" once shouldn't ring up 100 Mapbox calls if they
 * leave the input focused — we return the empty array straight from
 * the cache on every subsequent keystroke until the query changes.
 *
 * No TTL in v1: Mapbox results for major places don't drift over
 * months. The follow-up gap (#1143) adds a nightly job that refreshes
 * rows older than 90 days.
 */

import type { GeocoderPort, GeocoderPlace } from "./mapbox.js";
import type { IGeocoderCacheRepository } from "../../repositories/geocoderCacheRepository.js";

const MAX_CACHE_KEY_LENGTH = 290;

export function buildCachedGeocoder(
  inner: GeocoderPort,
  cache: IGeocoderCacheRepository,
): GeocoderPort {
  return {
    isLive() {
      return inner.isLive();
    },

    async forward(query, opts = {}) {
      const key = forwardKey(query, opts.countryIso2);
      if (key) {
        const cached = await cache.get(key);
        if (cached) {
          await cache.touch(key);
          return (cached as GeocoderPlace[]) ?? [];
        }
      }
      const result = await inner.forward(query, opts);
      if (key) {
        // Cache empty arrays too — see header.
        await cache.put(key, result);
      }
      return result;
    },

    async reverse(lat, lng) {
      const key = reverseKey(lat, lng);
      if (key) {
        const cached = await cache.get(key);
        if (cached !== undefined) {
          await cache.touch(key);
          return (cached as GeocoderPlace | null) ?? null;
        }
      }
      const result = await inner.reverse(lat, lng);
      if (key) {
        await cache.put(key, result);
      }
      return result;
    },
  };
}

/** Forward-geocode cache key. Lowercased + whitespace-collapsed so
 *  "Seattle, WA" and "seattle,  wa" hit the same row. Country bias is
 *  part of the key because different country filters return different
 *  result sets for the same query string. */
function forwardKey(query: string, countryIso2?: string): string | null {
  const norm = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (!norm) return null;
  const country = countryIso2 ? countryIso2.toUpperCase() : "";
  const key = `fwd:${norm}|${country}`;
  // Mapbox accepts queries up to ~256 chars; anything longer is almost
  // certainly garbage and we don't want to bloat the PK.
  return key.length > MAX_CACHE_KEY_LENGTH ? null : key;
}

/** Reverse-geocode cache key. Lat/lng rounded to 3 decimals = ~110m
 *  buckets, so two viewers in the same neighborhood share one cache
 *  entry instead of two near-identical Mapbox calls. */
function reverseKey(lat: number, lng: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const r = (n: number) => n.toFixed(3);
  return `rev:${r(lat)},${r(lng)}`;
}
