-- Migration 0216 — first-class `work_setting` on `job_items` (gap #2069).
--
-- Background: `job_items` only had an `is_remote` boolean, so the job
-- form's three-way choice (Onsite / Remote / Hybrid) was folded to
-- true/false on save — Hybrid became indistinguishable from Onsite and
-- the candidate-facing "hybrid" filter had nothing to query. Hybrid
-- roles also carry a weekly split (e.g. "2 days on-site, 3 days remote")
-- that had nowhere to live.
--
-- Fix: a canonical `work_setting` column (onsite | remote | hybrid, see
-- shared/work-settings.ts) plus two small day-count integers that are
-- only meaningful for hybrid. `is_remote` is KEPT as a derived
-- convenience (work_setting = 'remote') so every existing consumer that
-- reads it keeps working.
--
-- Idempotent via IF NOT EXISTS so the runner can replay safely. The
-- matching Drizzle declarations live in api/src/db/schema/jobs.ts.

ALTER TABLE "job_items"
  ADD COLUMN IF NOT EXISTS "work_setting" varchar(16),
  ADD COLUMN IF NOT EXISTS "onsite_days_per_week" integer,
  ADD COLUMN IF NOT EXISTS "remote_days_per_week" integer;

-- Backfill from the legacy boolean. Hybrid can't be recovered from a
-- single bool, so non-remote rows default to 'onsite' (the safe choice —
-- the next edit through the form sets the true value). Only touches rows
-- not already populated so replays are no-ops.
UPDATE "job_items"
  SET "work_setting" = CASE WHEN "is_remote" THEN 'remote' ELSE 'onsite' END
  WHERE "work_setting" IS NULL;

-- Guard the vocabulary. NOT VALID per the project template (validate on
-- write only; a follow-up VALIDATE CONSTRAINT migration can run once the
-- table is confirmed clean in prod).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_items_work_setting_check'
  ) THEN
    ALTER TABLE "job_items"
      ADD CONSTRAINT "job_items_work_setting_check"
      CHECK ("work_setting" IS NULL OR "work_setting" IN ('onsite', 'remote', 'hybrid'))
      NOT VALID;
  END IF;
END $$;

-- Partial index for the candidate-facing "work setting" filter on the
-- public-jobs query (WHERE is_active AND work_setting = $1).
CREATE INDEX IF NOT EXISTS "idx_job_items_work_setting"
  ON "job_items" ("work_setting")
  WHERE "work_setting" IS NOT NULL;
