-- Migration 0110 — Persistent cache for Mapbox geocoder calls.
--
-- Without this, every /api/locations/search request re-pays the Mapbox
-- forward-geocode cost even when the same query ("Seattle, WA") was
-- resolved seconds earlier. The picker fires one request per keystroke
-- (debounced 250ms) so a single creator typing one city can easily
-- ring up 5+ identical Mapbox calls per minute. Multiply by every
-- viewer using the LocationFilter and the free tier (100k req/mo)
-- evaporates fast.
--
-- Design:
--   • cache_key  — normalized lookup string. Two shapes:
--       forward: "fwd:<lower-q>|<country?>"
--       reverse: "rev:<lat-rounded-3>,<lng-rounded-3>"
--     Rounding lat/lng to ~110m bucketizes nearby "use my location"
--     hits so two coworkers in the same building share one entry.
--   • result    — JSON-serialized GeocoderPlace[] (forward) or single
--     GeocoderPlace object (reverse). null = Mapbox returned nothing;
--     we cache the negative result too so a typo isn't re-queried 100x.
--   • hit_count / last_hit_at — tracking to inform future TTL or
--     LRU eviction. v1 has no TTL: Mapbox geocode results for major
--     places don't change meaningfully over months. The follow-up
--     gap (see README #1143) adds a nightly job that re-queries
--     rows older than 90 days.
--   • No FKs — the cache lives independently of countries/states/cities.
--     LocationService.ensureGeocodedPlace handles ref-table updates on
--     the write-through path.

CREATE TABLE IF NOT EXISTS "geocoder_cache" (
  "cache_key"    varchar(300) PRIMARY KEY,
  "result"       jsonb,
  "hit_count"    integer NOT NULL DEFAULT 1,
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  "last_hit_at"  timestamptz NOT NULL DEFAULT now()
);

-- Lets the eviction / refresh job find stale rows quickly.
CREATE INDEX IF NOT EXISTS "geocoder_cache_last_hit_idx"
  ON "geocoder_cache" ("last_hit_at");
