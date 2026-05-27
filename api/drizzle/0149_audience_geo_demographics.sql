-- Migration 0149 — Audience taxonomy + geographic demographics foundation.
--
-- Builds the storage primitives that #1615 (geographic landing pages) and
-- #1616 (Resource Maps / per-audience landing pages) need, but stops at
-- schema — no UI, no GeoNames bulk import. That's the next pass.
--
-- Two independent additions in one migration because they're filed under
-- the same scope umbrella (the "Resource Maps" + "Locations" landing-page
-- foundation) and share a deploy window:
--
--   (1) content_audiences — polymorphic audience-tag table mirroring the
--       shape of content_locations (#0108). Lets every searchable entity
--       (job / resume / article / studio_template / learning_path / etc.)
--       carry one or more audience tags from either of two taxonomies:
--         - 'life_stage'  — NEW: recent_graduates, students, unemployed,
--                           layoff_recovery, career_changers,
--                           returning_to_workforce, veterans, gig_economy,
--                           international_job_seekers, early_career,
--                           senior_executives, job_seekers, employers,
--                           recruiters (13 keys)
--         - 'profession' — EXISTING: athlete / designer / developer / etc.
--                           (19 keys; mirrors the studio template catalog)
--
--   (2) Demographic + URL-routing columns on the existing geo reference
--       tables (cities / state_provinces / countries). All three gain
--       population + freshness metadata; cities additionally gain a
--       url-safe slug, timezone, and a GeoNames anchor id.
--
-- The new fields are nullable on purpose — schema lands now, data is
-- backfilled lazily (slug from existing name; population + geoname_id +
-- timezone from a future GeoNames cities500 import job). Page templates
-- that need population can either degrade gracefully when NULL or fall
-- back to the density signal.

-- ─── content_audiences ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "content_audiences" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Polymorphic discriminator. Keep in sync with CONTENT_LOCATION_KINDS in
  -- shared/content-locations.ts (which doubles as the audience-eligible
  -- entity set — every geo-taggable entity is also audience-taggable).
  -- No FK because entity_id points into one of N tables.
  "entity_kind"       varchar(32) NOT NULL,
  "entity_id"         uuid NOT NULL,

  -- The audience key. Validated at write time against the shared enum in
  -- shared/audiences.ts (Zod). Not a DB enum because the set grows
  -- additively and we don't want a migration per new audience key.
  "audience_key"      varchar(64) NOT NULL,

  -- Discriminates the two orthogonal axes ('life_stage' vs 'profession').
  -- Lets the same entity carry tags from both (a designer who is also a
  -- recent grad). Read paths usually filter by ONE taxonomy at a time.
  "audience_taxonomy" varchar(16) NOT NULL DEFAULT 'life_stage',

  "created_at"        timestamptz NOT NULL DEFAULT now(),
  "updated_at"        timestamptz NOT NULL DEFAULT now()
);

-- "Find all <kind> tagged with audience X" — the hot Resource-Map query.
CREATE INDEX IF NOT EXISTS "content_audiences_kind_audience_idx"
  ON "content_audiences" ("entity_kind", "audience_key");

-- "Show all audience tags on this one entity" — detail-page render.
CREATE INDEX IF NOT EXISTS "content_audiences_entity_idx"
  ON "content_audiences" ("entity_kind", "entity_id");

-- Idempotency: an (entity, audience) pair tags once. Re-tagging is a
-- no-op INSERT … ON CONFLICT DO NOTHING.
CREATE UNIQUE INDEX IF NOT EXISTS "content_audiences_entity_audience_uniq"
  ON "content_audiences" ("entity_kind", "entity_id", "audience_key");

-- Constrain the taxonomy discriminator to the two known values so a typo
-- in a write site doesn't silently desync the read path.
ALTER TABLE "content_audiences"
  ADD CONSTRAINT "content_audiences_taxonomy_check"
    CHECK ("audience_taxonomy" IN ('life_stage', 'profession')) NOT VALID;

-- ─── cities: slug + demographics + timezone + geoname anchor ───────────
ALTER TABLE "cities"
  ADD COLUMN IF NOT EXISTS "slug"              varchar(64),
  ADD COLUMN IF NOT EXISTS "population"        integer,
  ADD COLUMN IF NOT EXISTS "population_as_of"  date,
  ADD COLUMN IF NOT EXISTS "population_source" varchar(32),
  ADD COLUMN IF NOT EXISTS "timezone"          varchar(48),
  ADD COLUMN IF NOT EXISTS "geoname_id"        integer;

-- Backfill slug from name for every existing row. Lower-case + replace
-- any non-alphanumeric run with a single hyphen + strip leading/trailing
-- hyphens. Matches the canonical slugify() helper in shared/audiences.ts.
UPDATE "cities"
SET "slug" = trim(
  both '-' from regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g')
)
WHERE "slug" IS NULL;

-- Disambiguate any collisions WITHIN a state (two cities sharing a name
-- in the same state — rare in our seed, but the unique index would fail
-- without this). Appends a stable id suffix to the duplicates.
WITH dupes AS (
  SELECT id, slug, state_id,
         ROW_NUMBER() OVER (PARTITION BY state_id, slug ORDER BY created_at, id) AS rn
  FROM "cities"
)
UPDATE "cities" c
SET "slug" = dupes.slug || '-' || dupes.rn::text
FROM dupes
WHERE c.id = dupes.id
  AND dupes.rn > 1;

ALTER TABLE "cities" ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "cities_state_slug_uniq"
  ON "cities" ("state_id", "slug");

CREATE UNIQUE INDEX IF NOT EXISTS "cities_geoname_id_uniq"
  ON "cities" ("geoname_id")
  WHERE "geoname_id" IS NOT NULL;

-- Used by the "top N cities by population" cold-start ranking. Partial
-- index so it only covers rows that have a known population.
CREATE INDEX IF NOT EXISTS "cities_population_desc_idx"
  ON "cities" ("population" DESC NULLS LAST)
  WHERE "population" IS NOT NULL;

-- ─── state_provinces: demographics ─────────────────────────────────────
ALTER TABLE "state_provinces"
  ADD COLUMN IF NOT EXISTS "population"        bigint,
  ADD COLUMN IF NOT EXISTS "population_as_of"  date,
  ADD COLUMN IF NOT EXISTS "population_source" varchar(32);

CREATE INDEX IF NOT EXISTS "state_provinces_population_desc_idx"
  ON "state_provinces" ("population" DESC NULLS LAST)
  WHERE "population" IS NOT NULL;

-- ─── countries: demographics ───────────────────────────────────────────
ALTER TABLE "countries"
  ADD COLUMN IF NOT EXISTS "population"        bigint,
  ADD COLUMN IF NOT EXISTS "population_as_of"  date,
  ADD COLUMN IF NOT EXISTS "population_source" varchar(32);

CREATE INDEX IF NOT EXISTS "countries_population_desc_idx"
  ON "countries" ("population" DESC NULLS LAST)
  WHERE "population" IS NOT NULL;
