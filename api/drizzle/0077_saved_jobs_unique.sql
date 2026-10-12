-- 0077 — saved_jobs (user_id, job_id) uniqueness
--
-- Until now the `saved_jobs` table had no unique constraint on
-- (user_id, job_id). `JobService.saveJob` already calls
-- `.onConflictDoNothing()`, but Postgres has no target index to honour,
-- so every Save click on /jobs inserted a fresh row — a user reported
-- saving the same job multiple times and seeing duplicates pile up.
--
-- This migration:
--   1. dedups existing rows, keeping the most recently updated row per
--      (user_id, job_id) pair so any pipeline status / notes the user
--      progressed are preserved over an empty `tracked` duplicate.
--   2. adds the canonical unique index that Drizzle now declares on
--      `savedJobs` in `api/src/db/schema/jobs.ts`.

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, job_id
      ORDER BY updated_at DESC NULLS LAST,
               created_at DESC NULLS LAST,
               id
    ) AS rn
  FROM saved_jobs
)
DELETE FROM saved_jobs
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_saved_jobs_user_job
  ON saved_jobs (user_id, job_id);
