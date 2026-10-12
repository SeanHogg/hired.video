-- Migration 0513 — the review aggregate gets a polymorphic subject (#2254).
--
-- resume_reviews was hard-bound to resume_information (resume_id NOT NULL).
-- Feedback is for any document — a résumé today, a job or an article next —
-- so a review now names what it is about with the canonical polymorphic pair
-- (CONVENTIONS.md "Polymorphic references"):
--
--   subject_type  'resume' | 'job' | 'article'  (shared/resume-feedback.ts
--                 REVIEW_SUBJECT_TYPES; only 'resume' is wired in the API)
--   subject_id    the reviewed thing's id
--
-- resume_id stays as the typed FK for résumé subjects (it keeps the
-- ON DELETE CASCADE from the résumé); it becomes nullable so a non-résumé
-- review can exist, and a CHECK keeps it equal to subject_id for résumés.
--
-- Safe to run as-is, any number of times, and in either order with CI's
-- `drizzle-kit push` (which runs first and may already have added the
-- columns + index from db/schema/resumeFeedback.ts):
--   * columns are added IF NOT EXISTS, subject_type with a 'resume' default;
--   * subject_id stays nullable at the column level ON PURPOSE: declaring it
--     NOT NULL in the schema would make push add a NOT NULL column without a
--     default to a populated table, which `push --force` resolves by
--     TRUNCATING it. The service always writes it; the backfill below fills
--     every existing row;
--   * the backfill only fills subject_id where it is still NULL (copying
--     resume_id) — nothing is deleted or overwritten;
--   * constraints are gated on pg_constraint and added NOT VALID (TEMPLATE.md
--     rule 5); every existing row satisfies them after the backfill;
--   * the index is IF NOT EXISTS and declared in db/schema/resumeFeedback.ts
--     under the same name (CI drizzle-kit push drops undeclared indexes).

ALTER TABLE resume_reviews ADD COLUMN IF NOT EXISTS subject_type varchar(16) NOT NULL DEFAULT 'resume';
ALTER TABLE resume_reviews ADD COLUMN IF NOT EXISTS subject_id uuid;

UPDATE resume_reviews SET subject_id = resume_id WHERE subject_id IS NULL AND resume_id IS NOT NULL;

ALTER TABLE resume_reviews ALTER COLUMN resume_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resume_reviews_subject_type_check') THEN
    ALTER TABLE resume_reviews
      ADD CONSTRAINT resume_reviews_subject_type_check
      CHECK (subject_type IN ('resume', 'job', 'article')) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resume_reviews_resume_subject_check') THEN
    ALTER TABLE resume_reviews
      ADD CONSTRAINT resume_reviews_resume_subject_check
      CHECK (subject_type <> 'resume' OR resume_id = subject_id) NOT VALID;
  END IF;
END $$;

-- "Every review of this thing, newest first" (any subject kind).
CREATE INDEX IF NOT EXISTS idx_resume_reviews_subject_created
  ON resume_reviews (subject_type, subject_id, created_at DESC);
