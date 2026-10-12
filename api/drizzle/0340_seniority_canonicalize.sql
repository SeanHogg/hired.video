-- Migration 0340 — canonicalize `job_items.experience_level` (gap #2090).
--
-- Background: seniority was spelled multiple ways across the stack — the
-- job form shipped PascalCase (Entry/Junior/Mid/Senior/LeadExecutive/None)
-- and `buildJobColumnPatch` stored it raw, while the public-jobs filter did
-- an exact `eq(experience_level, $1)` against the lowercase read vocabulary
-- (entry/mid/senior/lead/executive). A job saved as "Senior" therefore never
-- matched a filter for "senior". `shared/seniority.ts` is now the SSoT and
-- normalizes on write + on compare; this migration folds the EXISTING rows
-- into the same canonical lowercase vocabulary so historical postings become
-- filterable too. "None"/not-specified → NULL.
--
-- Idempotent: the CASE collapses already-canonical values to themselves, so
-- the runner can replay safely. Mirrors the 0175 job_type canonicalization.

UPDATE "job_items"
SET "experience_level" = CASE regexp_replace(lower(trim("experience_level")), '[\s_/.-]+', '', 'g')
  WHEN 'entry'           THEN 'entry'
  WHEN 'entrylevel'      THEN 'entry'
  WHEN 'graduate'        THEN 'entry'
  WHEN 'intern'          THEN 'entry'
  WHEN 'junior'          THEN 'junior'
  WHEN 'jr'              THEN 'junior'
  WHEN 'juniorlevel'     THEN 'junior'
  WHEN 'associate'       THEN 'junior'
  WHEN 'mid'             THEN 'mid'
  WHEN 'midlevel'        THEN 'mid'
  WHEN 'intermediate'    THEN 'mid'
  WHEN 'senior'          THEN 'senior'
  WHEN 'sr'              THEN 'senior'
  WHEN 'seniorlevel'     THEN 'senior'
  WHEN 'lead'            THEN 'lead'
  WHEN 'leadexecutive'   THEN 'lead'
  WHEN 'staff'           THEN 'lead'
  WHEN 'principal'       THEN 'lead'
  WHEN 'manager'         THEN 'lead'
  WHEN 'executive'       THEN 'executive'
  WHEN 'director'        THEN 'executive'
  WHEN 'vp'              THEN 'executive'
  WHEN 'vicepresident'   THEN 'executive'
  WHEN 'clevel'          THEN 'executive'
  WHEN 'csuite'          THEN 'executive'
  WHEN 'exec'            THEN 'executive'
  WHEN 'executivelevel'  THEN 'executive'
  ELSE NULL  -- 'none', '', and any unmapped free-text → not specified
END
-- Already-canonical rows collapse to themselves and not-specified rows become
-- NULL (then skipped on replay), so this is safe to re-run.
WHERE "experience_level" IS NOT NULL;

-- Partial index for the candidate-facing seniority filter on the public-jobs
-- query (WHERE is_active AND experience_level = $1).
CREATE INDEX IF NOT EXISTS "idx_job_items_experience_level"
  ON "job_items" ("experience_level")
  WHERE "experience_level" IS NOT NULL;
