-- 0650_share_links_delete_triggers.sql
--
-- W3 follow-up (architecture remediation 2026-10-17): immediate subject-delete
-- cleanup for the polymorphic `share_links` table (0583).
--
-- The six per-kind tables 0583 replaced had FKs to their subject with
-- ON DELETE CASCADE, so deleting a deck / résumé / job / project / user
-- removed its links at once. A polymorphic subject has no FK, so until now
-- the links lingered until the daily retention sweep (a game invite for a
-- deleted project could still be joined, a studio review link still
-- resolved). Statement-level AFTER DELETE triggers on each subject table now
-- delete the subject's links in the same statement, mirroring 0581 for
-- `comments`. The retention sweep (SHARE_LINK_ORPHAN_SQL) stays as a backstop.
--
-- Subject type → table (registry shared/share-link-subjects.ts, map
-- SHARE_LINK_SUBJECT_TABLES in api/src/db/schema/shareLinks.ts):
--   candidate_resume → candidate_resumes
--   pitch_deck       → pitch_decks
--   pipeline_job     → job_items
--   studio_review    → studio_projects
--   reference_packet → users
--   game_play        → studio_projects
-- Every subject table's id is uuid, like share_links.subject_id, so the join
-- needs no cast (0583 only cast while backfilling the text-typed
-- studio_review_links.project_id).
--
-- Idempotent: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS / CREATE
-- TRIGGER. Cascaded deletes (e.g. a company deleting its candidate_resumes)
-- fire these triggers too, as the old FK cascades did.

CREATE OR REPLACE FUNCTION public.share_links_subject_deleted() RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  DELETE FROM public.share_links l
  USING old_rows o
  WHERE l.subject_type = TG_ARGV[0] AND l.subject_id = o.id;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_share_links_candidate_resume_deleted ON public.candidate_resumes;
CREATE TRIGGER trg_share_links_candidate_resume_deleted
  AFTER DELETE ON public.candidate_resumes
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.share_links_subject_deleted('candidate_resume');

DROP TRIGGER IF EXISTS trg_share_links_pitch_deck_deleted ON public.pitch_decks;
CREATE TRIGGER trg_share_links_pitch_deck_deleted
  AFTER DELETE ON public.pitch_decks
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.share_links_subject_deleted('pitch_deck');

DROP TRIGGER IF EXISTS trg_share_links_pipeline_job_deleted ON public.job_items;
CREATE TRIGGER trg_share_links_pipeline_job_deleted
  AFTER DELETE ON public.job_items
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.share_links_subject_deleted('pipeline_job');

DROP TRIGGER IF EXISTS trg_share_links_studio_review_deleted ON public.studio_projects;
CREATE TRIGGER trg_share_links_studio_review_deleted
  AFTER DELETE ON public.studio_projects
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.share_links_subject_deleted('studio_review');

DROP TRIGGER IF EXISTS trg_share_links_reference_packet_deleted ON public.users;
CREATE TRIGGER trg_share_links_reference_packet_deleted
  AFTER DELETE ON public.users
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.share_links_subject_deleted('reference_packet');

DROP TRIGGER IF EXISTS trg_share_links_game_play_deleted ON public.studio_projects;
CREATE TRIGGER trg_share_links_game_play_deleted
  AFTER DELETE ON public.studio_projects
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.share_links_subject_deleted('game_play');
