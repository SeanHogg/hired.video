-- Migration 0516 — ads target any content (#176).
--
-- The ads side could only promote jobs (job_boosts.job_id) and companies
-- (company_boosts.company_id); the ad creative (`ads`) had no target at all.
-- Every ads-side row now names what it promotes with the canonical
-- polymorphic pair (CONVENTIONS.md "Polymorphic references"):
--
--   subject_type  shared/ad-content-target.ts AD_SUBJECT_TYPES
--   subject_id    the promoted thing's id
--
--   ads             any AD_SUBJECT_TYPES value (nullable pair — an ad may
--                   still be a plain destination-URL creative)
--   job_boosts      always 'job',     subject_id = job_id
--   company_boosts  always 'company', subject_id = company_id
--
-- job_id / company_id are NOT dropped or rewritten here: they stay the typed
-- ON DELETE CASCADE anchor. Retiring them (fold job_boosts + company_boosts
-- into the polymorphic `boosts` table) is a separate, owner-gated follow-up.
--
-- Safe to auto-run, any number of times, in either order with CI's
-- `drizzle-kit push` (which runs first and may already have added the
-- columns, checks and indexes from db/schema/advertising.ts):
--   * columns are added IF NOT EXISTS and stay nullable (a NOT NULL column
--     without a default makes `push --force` truncate a populated table);
--   * the backfill writes ONLY the new columns, ONLY where they are still
--     NULL — nothing is deleted and no existing column is touched;
--   * CHECKs are gated on pg_constraint and added NOT VALID (TEMPLATE.md
--     rule 5); every existing row satisfies them after the backfill;
--   * indexes are IF NOT EXISTS and declared in db/schema/advertising.ts
--     under the same names (CI drizzle-kit push drops undeclared indexes).

ALTER TABLE ads ADD COLUMN IF NOT EXISTS subject_type varchar(32);
ALTER TABLE ads ADD COLUMN IF NOT EXISTS subject_id uuid;
ALTER TABLE job_boosts ADD COLUMN IF NOT EXISTS subject_type varchar(32);
ALTER TABLE job_boosts ADD COLUMN IF NOT EXISTS subject_id uuid;
ALTER TABLE company_boosts ADD COLUMN IF NOT EXISTS subject_type varchar(32);
ALTER TABLE company_boosts ADD COLUMN IF NOT EXISTS subject_id uuid;

-- Backfill from the legacy FKs (idempotent: only rows not yet stamped).
UPDATE job_boosts SET subject_type = 'job', subject_id = job_id
  WHERE subject_type IS NULL AND job_id IS NOT NULL;
UPDATE company_boosts SET subject_type = 'company', subject_id = company_id
  WHERE subject_type IS NULL AND company_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ads_subject_check') THEN
    ALTER TABLE ads
      ADD CONSTRAINT ads_subject_check
      CHECK ((subject_type IS NULL AND subject_id IS NULL) OR (subject_id IS NOT NULL AND subject_type IN ('job', 'company', 'article', 'course', 'template', 'video', 'studio_project', 'resume', 'service', 'voice_clone', 'event', 'user_profile'))) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_boosts_subject_check') THEN
    ALTER TABLE job_boosts
      ADD CONSTRAINT job_boosts_subject_check
      CHECK (subject_type IS NULL OR (subject_type = 'job' AND subject_id = job_id)) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_boosts_subject_check') THEN
    ALTER TABLE company_boosts
      ADD CONSTRAINT company_boosts_subject_check
      CHECK (subject_type IS NULL OR (subject_type = 'company' AND subject_id = company_id)) NOT VALID;
  END IF;
END $$;

-- "Every ad / boost promoting this thing, newest first".
CREATE INDEX IF NOT EXISTS idx_ads_subject_created
  ON ads (subject_type, subject_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_boosts_subject_created
  ON job_boosts (subject_type, subject_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_boosts_subject_created
  ON company_boosts (subject_type, subject_id, created_at DESC);
