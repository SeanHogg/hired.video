-- 0588_archive_share_tables.sql
--
-- W3-A engagement merges (architecture remediation 2026-10-17): the six
-- per-kind share tables were merged into `share_links` by 0583 and every
-- reader/writer now uses share_links. Their Drizzle declarations are gone,
-- so push no longer manages them.
--
-- Archive-first, never DROP: each table moves to the `archive` schema with
-- its rows, indexes and constraints intact. Restoring one is a single
--   ALTER TABLE archive.<t> SET SCHEMA public;
--
-- No live table has an FK into these tables today; any that exists in a
-- given database (whatever its name) is dropped first so no live write
-- depends on an archived row.

CREATE SCHEMA IF NOT EXISTS archive;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname, src.relname AS src_table
    FROM pg_constraint c
    JOIN pg_class src ON src.oid = c.conrelid
    JOIN pg_namespace srcns ON srcns.oid = src.relnamespace
    JOIN pg_class tgt ON tgt.oid = c.confrelid
    JOIN pg_namespace tgtns ON tgtns.oid = tgt.relnamespace
    WHERE c.contype = 'f'
      AND srcns.nspname = 'public'
      AND tgtns.nspname = 'public'
      AND tgt.relname IN (
        'candidate_resume_shares', 'pitch_deck_shares', 'pipeline_share_links',
        'studio_review_links', 'reference_shares', 'game_play_invites'
      )
      AND src.relname NOT IN (
        'candidate_resume_shares', 'pitch_deck_shares', 'pipeline_share_links',
        'studio_review_links', 'reference_shares', 'game_play_invites'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', r.src_table, r.conname);
  END LOOP;
END $$;

ALTER TABLE IF EXISTS public.candidate_resume_shares SET SCHEMA archive;
ALTER TABLE IF EXISTS public.pitch_deck_shares SET SCHEMA archive;
ALTER TABLE IF EXISTS public.pipeline_share_links SET SCHEMA archive;
ALTER TABLE IF EXISTS public.studio_review_links SET SCHEMA archive;
ALTER TABLE IF EXISTS public.reference_shares SET SCHEMA archive;
ALTER TABLE IF EXISTS public.game_play_invites SET SCHEMA archive;
