-- #1612 — Soft-delete convention unification.
--
-- Three conventions existed:
--   (a) `deleted_at timestamp NULL`     — users (retention-aware soft delete)
--   (b) `archived_at timestamp NULL`    — jobs, resumes (added in 0123)
--   (c) `is_archived boolean`           — externalEmail, messaging, productivity (boards),
--                                          scorecards × 3, studiofeatures (interviewQuestionSets)
--
-- Picking ONE for the codebase:
--   - `archived_at timestamp NULL` is the canonical going-forward shape:
--     keeps the "when" information, naturally filterable as `WHERE
--     archived_at IS NULL` for active rows, and matches the two
--     active-feature surfaces (jobs + resumes) that already use it.
--   - `deleted_at` on users stays separate — soft-DELETE semantics with
--     retention window differ from soft-ARCHIVE semantics (users keep
--     their personal data referenced by other tables; archive is a UI
--     hide).
--
-- This migration adds `archived_at` columns to the boolean-only tables
-- and backfills from `is_archived` (true → archived_at = now(), false
-- → NULL). The boolean column STAYS during transition — services can
-- migrate slice-by-slice without coordinated cutover. Reads should use
-- the shared helper at services/db/soft-delete.ts which prefers
-- archived_at when present.
--
-- Documentation: docs/conventions/soft-delete.md (written alongside).

-- Helper: add archived_at if missing, then backfill from is_archived.
CREATE OR REPLACE FUNCTION public.__mig_0154_add_archived_at(target_table text)
RETURNS void
LANGUAGE plpgsql
AS $func$
BEGIN
  EXECUTE format(
    'ALTER TABLE %I ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone',
    target_table
  );

  -- Backfill from is_archived if that column exists.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = target_table AND column_name = 'is_archived'
  ) THEN
    EXECUTE format(
      'UPDATE %I SET archived_at = NOW() WHERE is_archived = true AND archived_at IS NULL',
      target_table
    );
  END IF;

  -- Partial index on active rows — most reads filter "WHERE archived_at IS NULL".
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_%I_active ON %I ((1)) WHERE archived_at IS NULL',
    target_table, target_table
  );
END;
$func$;

-- Tables with the `is_archived boolean` convention.
SELECT public.__mig_0154_add_archived_at('external_email_messages');
SELECT public.__mig_0154_add_archived_at('messaging_threads');
SELECT public.__mig_0154_add_archived_at('boards');
SELECT public.__mig_0154_add_archived_at('scorecard_kits');
SELECT public.__mig_0154_add_archived_at('scorecard_attributes');
SELECT public.__mig_0154_add_archived_at('scorecard_templates');
SELECT public.__mig_0154_add_archived_at('interview_question_sets');

DROP FUNCTION IF EXISTS public.__mig_0154_add_archived_at(text);
