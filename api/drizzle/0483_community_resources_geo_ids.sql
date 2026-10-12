-- Migration 0483 — canonical geo ids on community_resources (#1833).
--
-- The directory was keyed only by lowercase slugs (country_code / state_code /
-- city_slug). The US flow is consistent (submission + seed + /in query all
-- derive from the same URL slug), but an international or abbrev-vs-full-name
-- slug ("texas" submitted vs "tx" in the /in URL) wouldn't match. These
-- nullable columns hold the canonical reference ids resolved from the slugs at
-- submit time so the query can match on identity, not string form. Legacy rows
-- (null ids) keep matching by slug. `countries.id` is serial (int); state/city
-- are uuid.
ALTER TABLE "community_resources" ADD COLUMN IF NOT EXISTS "country_geo_id" integer;
ALTER TABLE "community_resources" ADD COLUMN IF NOT EXISTS "state_geo_id" uuid;
ALTER TABLE "community_resources" ADD COLUMN IF NOT EXISTS "city_geo_id" uuid;

-- Identity-keyed directory lookup (approved rows for a country/state by id).
CREATE INDEX IF NOT EXISTS "idx_community_resources_geo_ids"
  ON "community_resources" ("country_geo_id", "state_geo_id", "status");
