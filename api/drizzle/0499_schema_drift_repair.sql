-- Migration 0499 — repair schema drift production never received.
--
-- Columns were appended to migrations AFTER production had recorded them as
-- applied (the runner tracks files by name, so the edits never ran), and the
-- `drizzle-kit push` safety net had been crashing on an interactive rename
-- prompt (help_mappings article_id → slug) while CI reported success. Found
-- 2026-10-04 when POST /api/studio/upload 500'd: column "branded" of
-- relation "videos" does not exist.
--
-- Additive only. help_mappings (prod still has v1 article_id, schema says
-- slug) needs a destructive rebuild and is left for an explicit decision.
--
-- IF NOT EXISTS here is load-bearing, not defensive: a fresh database already
-- has these columns from the (edited) 0497 / 0210, production does not.

-- 0497 (appended after it was applied): render watermark flag + AI pre-screen.
ALTER TABLE videos ADD COLUMN IF NOT EXISTS branded boolean NOT NULL DEFAULT false;

ALTER TABLE promotion_submissions
  ADD COLUMN IF NOT EXISTS screening_verdict varchar(16) NOT NULL DEFAULT 'unscreened';
ALTER TABLE promotion_submissions ADD COLUMN IF NOT EXISTS screening_notes text;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'promotion_submissions_screening_verdict_check'
  ) THEN
    ALTER TABLE promotion_submissions ADD CONSTRAINT promotion_submissions_screening_verdict_check
      CHECK (screening_verdict IN ('pass', 'flag', 'block', 'unscreened'));
  END IF;
END $$;

-- Canonical soft-delete column (CONVENTIONS.md) was declared on competencies
-- without a migration; backfill from the legacy flag like 0154 did elsewhere.
ALTER TABLE competencies ADD COLUMN IF NOT EXISTS archived_at timestamptz;
UPDATE competencies SET archived_at = updated_at WHERE is_archived AND archived_at IS NULL;
