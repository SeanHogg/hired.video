-- W3-D2 item 4 (architecture remediation 2026-10-17): copied identity
-- columns (3NF). Archive-first, then drop the copies whose source is a real
-- reference:
--   placements.recruiter_name            → users.name via recruiter_id (always
--                                          the owning, real recruiter)
--   recruiter_match_scores.candidate_name → talent_pool_candidates.candidate_name
--   recruiter_match_scores.job_title      → job_items.title
-- Kept (the row's own data, documented in the schema): talent_pool_candidates
-- candidate_* / current_*, candidate_submissions candidate_* / job_title /
-- company_name, placements candidate_name / company_name / job_title — their
-- candidate_id is a placeholder (the recruiter's id) for off-platform
-- candidates; job_pipeline_entries candidate_* (candidate_user_id is NULL for
-- off-platform candidates); offer_letters (a signed legal snapshot);
-- company_team_members name / avatar_url (user_id is NULL for non-users).

CREATE SCHEMA IF NOT EXISTS archive;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'placements' AND column_name = 'recruiter_name'
  ) AND to_regclass('archive.placements_recruiter_name_0623') IS NULL THEN
    CREATE TABLE archive.placements_recruiter_name_0623 AS
      SELECT id, recruiter_id, recruiter_name FROM public.placements;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'recruiter_match_scores' AND column_name = 'candidate_name'
  ) AND to_regclass('archive.recruiter_match_scores_names_0623') IS NULL THEN
    CREATE TABLE archive.recruiter_match_scores_names_0623 AS
      SELECT id, candidate_id, job_id, candidate_name, job_title FROM public.recruiter_match_scores;
  END IF;
END $$;

ALTER TABLE placements DROP COLUMN IF EXISTS recruiter_name;
ALTER TABLE recruiter_match_scores DROP COLUMN IF EXISTS candidate_name;
ALTER TABLE recruiter_match_scores DROP COLUMN IF EXISTS job_title;
