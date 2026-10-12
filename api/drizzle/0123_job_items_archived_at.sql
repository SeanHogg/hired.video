-- Migration 0123 — `archived_at` column on `job_items` (gap #154 follow-on).
--
-- This is the post-vacuum half of the column add that 0121 originally
-- tried to land. 0121's `ALTER TABLE "job_items" ADD COLUMN archived_at`
-- failed with PostgreSQL's "tables can have at most 1600 columns" error
-- because the table had accumulated dropped column slots over time. The
-- slot reclamation happens in 0122 (one-shot `VACUUM FULL`); this file
-- then adds the column into the freshly compacted attribute space.
--
-- Idempotent via `IF NOT EXISTS` so the runner can safely replay it.
-- The matching Drizzle declaration already lives at
--   api/src/db/schema/jobs.ts:90 (`archivedAt: timestamp("archived_at", ...)`)
-- so this migration is what brings the database into agreement with the
-- pgTable definition that's already been compiled into the API.

ALTER TABLE "job_items"
  ADD COLUMN IF NOT EXISTS "archived_at" timestamptz;

-- Partial index supporting "show non-archived" — the default mode for
-- every job list and the most-common filter. Mirrors the resume-side
-- index landed in 0121 for `resume_information`. Keyed by `is_active`
-- because the dominant query is `WHERE is_active = TRUE AND archived_at
-- IS NULL` ordered by `created_at` (see Jobs.tsx and the recruiter
-- pipeline reads).
CREATE INDEX IF NOT EXISTS "idx_job_items_archived_at_null"
  ON "job_items" ("is_active")
  WHERE "archived_at" IS NULL;
