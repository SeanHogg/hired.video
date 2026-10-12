-- Migration 0109 — Backfill existing free-text `location` strings into the
-- polymorphic content_locations table.
--
-- Scope of this migration (intentionally narrow — Mapbox is unreachable
-- from a SQL transaction so this is a *best-effort* seed-data-only pass):
--   • job_items.location          → content_locations(kind='job', role='origin')
--   • user_profiles.location      → content_locations(kind='user_profile', role='origin')
--   •                             → user_profiles.home_*_id columns
--
-- Out of scope (logged in Consolidated Gap Register):
--   • talent_pool_candidates.preferred_locations — comma-separated free
--     text, needs a worker job to split + geocode each token.
--   • job_alerts.location / job_preferences.desired_location — these are
--     user-input search subscriptions, not content; the next-render of
--     those pages will re-populate them from the LocationFilter UI.
--   • Rows whose free-text doesn't match any seeded city/state/country
--     stay un-migrated — a follow-up worker job (deferred) will run
--     them through Mapbox.
--
-- Parser strategy:
--   - "City, State" or "City, ST"  → exact-match against cities joined
--     to state_provinces by name or code.
--   - "City, Country"              → city + country join.
--   - "Remote", "Anywhere"         → mark is_remote=true (no FK ids).
--   - "City" alone                 → city match (ambiguous; takes the
--     first hit by lower(name)).
--   - "State" or "ST" alone        → state-only row.
--   - "Country" alone              → country-only row.
--
-- All inserts use the predicate form of ON CONFLICT (matching the
-- partial unique index created in 0108) so re-running is idempotent.
-- Note: must use `ON CONFLICT (cols) WHERE predicate DO NOTHING`, not
-- `ON CONFLICT ON CONSTRAINT name` — partial unique indexes are
-- indexes, not constraints, and the latter form errors at parse time
-- ("constraint does not exist").

-- ─── Helpers (inline CTEs) ──────────────────────────────────────────────

-- "City, ST" — split + match against state code (e.g. "Seattle, WA").
WITH parsed AS (
  SELECT
    ji.id              AS entity_id,
    trim(split_part(ji.location, ',', 1))  AS city_part,
    upper(trim(split_part(ji.location, ',', 2))) AS state_code_part,
    ji.is_remote
  FROM "job_items" ji
  WHERE ji.location IS NOT NULL
    AND length(trim(ji.location)) > 0
    AND position(',' in ji.location) > 0
),
city_match AS (
  SELECT
    p.entity_id,
    c.id  AS city_id,
    sp.id AS state_id,
    co.id AS country_id,
    NULLIF(c.latitude, '')::double precision  AS latitude,
    NULLIF(c.longitude, '')::double precision AS longitude,
    p.is_remote
  FROM parsed p
  JOIN "state_provinces" sp ON sp.code = p.state_code_part
  JOIN "cities" c  ON c.state_id = sp.id AND lower(c.name) = lower(p.city_part)
  JOIN "countries" co ON co.id = sp.country_id
)
INSERT INTO "content_locations" (
  "entity_kind", "entity_id", "role",
  "country_id", "state_id", "city_id",
  "latitude", "longitude", "is_remote", "label"
)
SELECT
  'job', cm.entity_id, 'origin',
  cm.country_id, cm.state_id, cm.city_id,
  cm.latitude, cm.longitude,
  COALESCE(cm.is_remote, false),
  NULL
FROM city_match cm
ON CONFLICT ("entity_kind", "entity_id") WHERE "role" = 'origin' DO NOTHING;

-- "City" alone (no comma) — best-effort: take the first matching
-- seeded city by name. Skipped if the entity already got an origin row
-- from the previous CTE.
WITH city_only AS (
  SELECT
    ji.id  AS entity_id,
    lower(trim(ji.location)) AS lc_name,
    ji.is_remote
  FROM "job_items" ji
  WHERE ji.location IS NOT NULL
    AND length(trim(ji.location)) > 0
    AND position(',' in ji.location) = 0
    AND NOT EXISTS (
      SELECT 1 FROM "content_locations" cl
      WHERE cl.entity_kind = 'job' AND cl.entity_id = ji.id AND cl.role = 'origin'
    )
),
ranked AS (
  SELECT
    co.entity_id,
    c.id  AS city_id,
    sp.id AS state_id,
    cn.id AS country_id,
    NULLIF(c.latitude, '')::double precision  AS latitude,
    NULLIF(c.longitude, '')::double precision AS longitude,
    co.is_remote,
    ROW_NUMBER() OVER (PARTITION BY co.entity_id ORDER BY c.name) AS rn
  FROM city_only co
  JOIN "cities" c ON lower(c.name) = co.lc_name
  JOIN "state_provinces" sp ON sp.id = c.state_id
  JOIN "countries" cn ON cn.id = sp.country_id
)
INSERT INTO "content_locations" (
  "entity_kind", "entity_id", "role",
  "country_id", "state_id", "city_id",
  "latitude", "longitude", "is_remote"
)
SELECT
  'job', r.entity_id, 'origin',
  r.country_id, r.state_id, r.city_id,
  r.latitude, r.longitude,
  COALESCE(r.is_remote, false)
FROM ranked r
WHERE r.rn = 1
ON CONFLICT ("entity_kind", "entity_id") WHERE "role" = 'origin' DO NOTHING;

-- "Remote" / "Anywhere" sentinel — mark is_remote on the origin row.
INSERT INTO "content_locations" (
  "entity_kind", "entity_id", "role", "is_remote", "label"
)
SELECT
  'job', ji.id, 'origin', true, ji.location
FROM "job_items" ji
WHERE ji.location IS NOT NULL
  AND lower(trim(ji.location)) IN ('remote', 'anywhere', 'worldwide', 'work from home', 'wfh')
  AND NOT EXISTS (
    SELECT 1 FROM "content_locations" cl
    WHERE cl.entity_kind = 'job' AND cl.entity_id = ji.id AND cl.role = 'origin'
  )
ON CONFLICT ("entity_kind", "entity_id") WHERE "role" = 'origin' DO NOTHING;

-- Mirror: job_items.is_remote=true rows get a remote origin even if
-- the location string is empty (covers fully-remote postings).
INSERT INTO "content_locations" (
  "entity_kind", "entity_id", "role", "is_remote"
)
SELECT 'job', ji.id, 'origin', true
FROM "job_items" ji
WHERE ji.is_remote = true
  AND NOT EXISTS (
    SELECT 1 FROM "content_locations" cl
    WHERE cl.entity_kind = 'job' AND cl.entity_id = ji.id AND cl.role = 'origin'
  )
ON CONFLICT ("entity_kind", "entity_id") WHERE "role" = 'origin' DO NOTHING;

-- ─── user_profiles: free-text → content_locations + home_* columns ─────
-- Same parser strategy as jobs, but we ALSO populate the structured
-- home_country/state/city columns on user_profiles so the personalized
-- feed can read them without a content_locations join.
WITH parsed AS (
  SELECT
    up.id              AS profile_id,
    up.user_id         AS user_id,
    trim(split_part(up.location, ',', 1))         AS city_part,
    upper(trim(split_part(up.location, ',', 2)))  AS state_code_part
  FROM "user_profiles" up
  WHERE up.location IS NOT NULL
    AND length(trim(up.location)) > 0
    AND position(',' in up.location) > 0
),
city_match AS (
  SELECT
    p.profile_id,
    p.user_id,
    c.id   AS city_id,
    sp.id  AS state_id,
    co.id  AS country_id,
    NULLIF(c.latitude, '')::double precision  AS latitude,
    NULLIF(c.longitude, '')::double precision AS longitude
  FROM parsed p
  JOIN "state_provinces" sp ON sp.code = p.state_code_part
  JOIN "cities" c           ON c.state_id = sp.id AND lower(c.name) = lower(p.city_part)
  JOIN "countries" co       ON co.id = sp.country_id
)
UPDATE "user_profiles" up
SET
  home_country_id = cm.country_id,
  home_state_id   = cm.state_id,
  home_city_id    = cm.city_id,
  home_latitude   = cm.latitude,
  home_longitude  = cm.longitude
FROM city_match cm
WHERE up.id = cm.profile_id
  AND up.home_city_id IS NULL;

-- Insert the matching origin row in content_locations for the user_profile
-- entity kind so search across "people I want to hire from Seattle" works
-- without a separate code path.
WITH parsed AS (
  SELECT
    up.id              AS profile_id,
    up.user_id         AS user_id,
    trim(split_part(up.location, ',', 1))         AS city_part,
    upper(trim(split_part(up.location, ',', 2)))  AS state_code_part
  FROM "user_profiles" up
  WHERE up.location IS NOT NULL
    AND length(trim(up.location)) > 0
    AND position(',' in up.location) > 0
),
city_match AS (
  SELECT
    p.user_id,
    c.id   AS city_id,
    sp.id  AS state_id,
    co.id  AS country_id,
    NULLIF(c.latitude, '')::double precision  AS latitude,
    NULLIF(c.longitude, '')::double precision AS longitude
  FROM parsed p
  JOIN "state_provinces" sp ON sp.code = p.state_code_part
  JOIN "cities" c           ON c.state_id = sp.id AND lower(c.name) = lower(p.city_part)
  JOIN "countries" co       ON co.id = sp.country_id
)
INSERT INTO "content_locations" (
  "entity_kind", "entity_id", "role",
  "country_id", "state_id", "city_id",
  "latitude", "longitude"
)
SELECT
  'user_profile', cm.user_id, 'origin',
  cm.country_id, cm.state_id, cm.city_id,
  cm.latitude, cm.longitude
FROM city_match cm
ON CONFLICT ("entity_kind", "entity_id") WHERE "role" = 'origin' DO NOTHING;

-- ─── Anything that didn't match stays free-text-only for now ────────────
-- The original `location` varchar columns are intentionally left in
-- place — UI continues to render the free-text fallback when no
-- structured row exists. A follow-up Cloudflare Worker job will rerun
-- the unmatched rows through the Mapbox geocoder.
