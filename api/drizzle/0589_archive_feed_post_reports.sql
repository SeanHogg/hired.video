-- 0589_archive_feed_post_reports.sql
--
-- W3-A engagement merges (architecture remediation 2026-10-17, gap #2410-#2417).
--
-- 0584 folded feed_post_reports into content_reports (entity_type
-- 'feed_post'); POST /api/feed/posts/:id/report files through the moderation
-- service and the Drizzle declaration is removed. Archive-first, never DROP
-- (restore with ALTER TABLE archive.feed_post_reports SET SCHEMA public).

CREATE SCHEMA IF NOT EXISTS archive;

-- Drop every FK on a live table that points INTO a table being archived,
-- whatever the constraint is called in a given database (0545 pattern).
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
      AND tgt.relname IN ('feed_post_reports')
      AND src.relname NOT IN ('feed_post_reports')
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', r.src_table, r.conname);
  END LOOP;
END $$;

ALTER TABLE IF EXISTS public.feed_post_reports SET SCHEMA archive;
