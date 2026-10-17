-- 0585_archive_legacy_view_tables.sql
--
-- W3-A engagement merges, step 2 of 2 for views. 0580 backfilled these five
-- tables into artifact_views and every reader/writer now uses artifact_views
-- (event_type view | listing_view | player_view | impression | cta_click |
-- share); their Drizzle declarations are gone, so push no longer manages them.
--
-- Archive-first, never DROP: each table moves to the `archive` schema with its
-- rows, indexes and constraints intact. Restore with
--   ALTER TABLE archive.<t> SET SCHEMA public;
-- (profile_views was archived by 0545.)

CREATE SCHEMA IF NOT EXISTS archive;

-- Drop any FK on a live table that points INTO one of these tables (none are
-- known; this keeps the archive safe whatever a given database holds).
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
      AND tgt.relname IN ('resume_views', 'company_views', 'job_view_events', 'company_view_events', 'video_analytics')
      AND src.relname NOT IN ('resume_views', 'company_views', 'job_view_events', 'company_view_events', 'video_analytics')
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', r.src_table, r.conname);
  END LOOP;
END $$;

ALTER TABLE IF EXISTS public.resume_views SET SCHEMA archive;
ALTER TABLE IF EXISTS public.company_views SET SCHEMA archive;
ALTER TABLE IF EXISTS public.job_view_events SET SCHEMA archive;
ALTER TABLE IF EXISTS public.company_view_events SET SCHEMA archive;
ALTER TABLE IF EXISTS public.video_analytics SET SCHEMA archive;
