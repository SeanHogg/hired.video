-- #661 — Studio project slug as a real column with a unique index.
--
-- Background: `ensureUniqueProjectSlug` ran a `LIKE 'baseSlug%'` against
-- `studio_projects.storyboard->>'_slug'` on every save-draft. That's an
-- unindexed JSONB extraction, which means a sequential scan of the full
-- `studio_projects` table per save. As the table grew the save-draft
-- route started hitting the Cloudflare Worker CPU limit (`Worker
-- exceeded CPU time limit` in production tail, 2026-05-26), and the
-- basic-template click on /studio started returning 503.
--
-- Fix: promote `_slug` to a top-level `slug` column with a unique index.
-- The save-draft writer mirrors into both `slug` and `storyboard._slug`
-- so legacy reads (toProjectDto pulls `_slug` from the JSONB) keep
-- working during the transition. The uniqueness check becomes an O(log
-- n) point lookup against the index instead of a sequential scan.
--
-- Backfill is automatic for any row that already has `storyboard._slug`
-- populated. Rows without a slug stay NULL; the next save-draft write
-- will populate them via `makeProjectSlug` + `ensureUniqueProjectSlug`.
--
-- Closes the slug half of gap #661. The cron CPU-budget gap is tracked
-- separately as #1701.

ALTER TABLE studio_projects
  ADD COLUMN IF NOT EXISTS slug varchar(120);

-- Strip any inherited STORED/GENERATED expression on `slug` and any
-- DEFAULT clause that references another column. Production was
-- bootstrapped with `drizzle-kit push` and introspection materialised
-- this column as `GENERATED ALWAYS AS (NULLIF(lower(storyboard->>'_slug'),
-- '')) STORED` (also serialised in the 0129 backfill as a DEFAULT
-- referencing `storyboard`, which Postgres rejects on UPDATE with
-- `column "slug" can only be updated to DEFAULT`). The save-draft
-- writer now owns slug mirroring explicitly, so the column must be a
-- plain writable varchar. DROP EXPRESSION IF EXISTS is a no-op when
-- the column was never generated (e.g. fresh local DBs), and DROP
-- DEFAULT is idempotent in Postgres regardless of whether one was set.
ALTER TABLE studio_projects
  ALTER COLUMN slug DROP EXPRESSION IF EXISTS;
ALTER TABLE studio_projects
  ALTER COLUMN slug DROP DEFAULT;

-- Backfill from the JSONB blob where the slug already exists. NULLIF
-- guards against rows where the JSONB key is missing entirely (->>
-- returns NULL on missing keys, but storing the JSON literal 'null'
-- would produce the string "null" — the NULLIF makes this defensive).
UPDATE studio_projects
SET slug = NULLIF(storyboard->>'_slug', '')
WHERE slug IS NULL
  AND storyboard ? '_slug';

-- Partial unique index so two projects can't share a slug, but rows
-- without a slug (NULL) are allowed to coexist. Standard pattern for
-- "optional but globally unique when present" columns.
CREATE UNIQUE INDEX IF NOT EXISTS uq_studio_projects_slug
  ON studio_projects(slug)
  WHERE slug IS NOT NULL;

-- #1588 — Closes the slug-index half of the resume embed/detail CPU
-- exhaustion the same incident surfaced. `findByIdOrSlug` runs
-- `eq(resumeInformation.slug, idOrSlug)` on every embed / detail load,
-- and `resume_information` only had `(user_id)` + `(parent_id)`
-- indexes — the slug query sequentially scanned the table, which
-- compounded with the JSONB normalization step to push the worker
-- past the CPU ceiling. The PG `NULLS NOT DISTINCT` clause IS NOT
-- used here because the index is non-unique (multiple users can
-- coexist with NULL slug); we just want lookup speed.
CREATE INDEX IF NOT EXISTS resume_information_slug_idx
  ON resume_information(slug)
  WHERE slug IS NOT NULL;
