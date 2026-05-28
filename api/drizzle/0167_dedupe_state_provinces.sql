-- Migration 0167 — Dedupe state_provinces + add the unique constraint that
-- should have existed since 0108.
--
-- Root cause (surfaced by the #1628 footer Locations column rendering
-- "Alberta ×4" / "Alabama ×4"): state_provinces has NEVER had a unique
-- constraint. The seed in 0108 used `ON CONFLICT DO NOTHING` with no
-- conflict target — a NO-OP when there's no unique index to conflict
-- against. So every time 0108 (re-)ran before `_sql_migrations` tracking
-- landed (2026-05-25, per feedback_fix_root_cause_not_workaround) it
-- inserted a fresh full set of states. Production shows ~4× duplication.
--
-- Root-cause fix: collapse duplicates, repoint child FKs to the survivor,
-- add the unique index so the seed's ON CONFLICT finally catches.
--
-- ── HTTP-driver constraint (the #1625 lesson) ─────────────────────────
-- run-sql-migrations.mjs executes each statement as a SEPARATE Neon HTTP
-- request — there is NO shared session across statements, so a
-- `CREATE TEMP TABLE` in one statement is gone by the next. Therefore the
-- survivor map is recomputed inline (CTE) in EVERY statement rather than
-- materialized once. The repeated `surv` CTE is intentional duplication
-- forced by the execution model, not an oversight.
--
-- Survivor = earliest-created row per (country_id, lower(name)).
-- Idempotent: after a full apply every state maps to itself
-- (dupe_id = survivor_id) so all `dupe_id <> survivor_id` predicates match
-- nothing on re-run; the index uses IF NOT EXISTS. Safe from any
-- partially-applied state — each statement reconverges from live data.

-- ── 1. Collapse city duplicates that would collide on repoint ──────────
-- cities carries (state_id, slug) UNIQUE (from 0166). If two duplicate
-- states each seeded "austin", repointing both onto the survivor would
-- violate it — so delete all but the earliest city per (survivor, slug)
-- FIRST. The partition spans every city whose state is in the dupe group
-- (incl. cities already on the survivor) so cross-dupe collisions are
-- caught too.
WITH surv AS (
  SELECT id AS dupe_id,
         first_value(id) OVER (
           PARTITION BY country_id, lower(name)
           ORDER BY created_at, id
         ) AS survivor_id
  FROM state_provinces
),
city_ranked AS (
  SELECT c.id AS city_id,
         row_number() OVER (
           PARTITION BY s.survivor_id, c.slug
           ORDER BY c.created_at, c.id
         ) AS rn
  FROM cities c
  JOIN surv s ON c.state_id = s.dupe_id
)
DELETE FROM cities
WHERE id IN (SELECT city_id FROM city_ranked WHERE rn > 1);

-- ── 2. Repoint surviving cities onto the survivor state ────────────────
WITH surv AS (
  SELECT id AS dupe_id,
         first_value(id) OVER (
           PARTITION BY country_id, lower(name)
           ORDER BY created_at, id
         ) AS survivor_id
  FROM state_provinces
)
UPDATE cities c
SET state_id = s.survivor_id
FROM surv s
WHERE c.state_id = s.dupe_id
  AND s.dupe_id <> s.survivor_id;

-- ── 3. Repoint content_locations (no per-state unique → no collisions) ──
WITH surv AS (
  SELECT id AS dupe_id,
         first_value(id) OVER (
           PARTITION BY country_id, lower(name)
           ORDER BY created_at, id
         ) AS survivor_id
  FROM state_provinces
)
UPDATE content_locations cl
SET state_id = s.survivor_id
FROM surv s
WHERE cl.state_id = s.dupe_id
  AND s.dupe_id <> s.survivor_id;

-- ── 4. Repoint user_profiles.home_state_id ─────────────────────────────
WITH surv AS (
  SELECT id AS dupe_id,
         first_value(id) OVER (
           PARTITION BY country_id, lower(name)
           ORDER BY created_at, id
         ) AS survivor_id
  FROM state_provinces
)
UPDATE user_profiles up
SET home_state_id = s.survivor_id
FROM surv s
WHERE up.home_state_id = s.dupe_id
  AND s.dupe_id <> s.survivor_id;

-- ── 5. Delete the loser state rows ─────────────────────────────────────
WITH surv AS (
  SELECT id AS dupe_id,
         first_value(id) OVER (
           PARTITION BY country_id, lower(name)
           ORDER BY created_at, id
         ) AS survivor_id
  FROM state_provinces
)
DELETE FROM state_provinces sp
USING surv s
WHERE sp.id = s.dupe_id
  AND s.dupe_id <> s.survivor_id;

-- ── 6. Prevent recurrence ──────────────────────────────────────────────
-- A target-less ON CONFLICT DO NOTHING (what 0108's seed uses) catches
-- expression-index violations, so the seed becomes idempotent the moment
-- this index exists.
CREATE UNIQUE INDEX IF NOT EXISTS state_provinces_country_lname_uniq
  ON state_provinces (country_id, lower(name));
