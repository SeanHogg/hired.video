-- W3-D2 item 2: saved_jobs is the bookmark only. Its lifecycle copies
-- (status / applied_at / status_changed_at) were backfilled into
-- job_applications by 0621; archive them, then drop the columns.

CREATE SCHEMA IF NOT EXISTS archive;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'saved_jobs' AND column_name = 'status'
  ) AND to_regclass('archive.saved_jobs_lifecycle_0622') IS NULL THEN
    CREATE TABLE archive.saved_jobs_lifecycle_0622 AS
      SELECT id, user_id, job_id, status, applied_at, status_changed_at, created_at, updated_at
      FROM public.saved_jobs;
  END IF;
END $$;

DROP INDEX IF EXISTS idx_saved_jobs_user_status_created;
ALTER TABLE saved_jobs DROP COLUMN IF EXISTS status;
ALTER TABLE saved_jobs DROP COLUMN IF EXISTS applied_at;
ALTER TABLE saved_jobs DROP COLUMN IF EXISTS status_changed_at;

-- Replaces idx_saved_jobs_user_status_created for "my saved jobs, newest first".
CREATE INDEX IF NOT EXISTS idx_saved_jobs_user_created ON saved_jobs (user_id, created_at DESC);
