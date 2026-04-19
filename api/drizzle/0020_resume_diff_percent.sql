-- Migration: 0020_resume_diff_percent
-- Adds diff_percent column to resume_information so child resumes can record
-- how much their content diverges from their parent. Populated by the API on
-- variant create/update (and recomputed for all children when a parent
-- changes). Null for rows that are not variants (parent_id IS NULL).

ALTER TABLE "resume_information"
  ADD COLUMN IF NOT EXISTS "diff_percent" integer;
