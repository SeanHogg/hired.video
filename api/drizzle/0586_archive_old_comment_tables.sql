-- 0586_archive_old_comment_tables.sql
--
-- W3-A engagement merges (architecture remediation 2026-10-17, gap #2410-#2417).
--
-- 0581 backfilled booking_comments, feed_post_comments, review_comments and
-- studio_review_comments into the polymorphic `comments` table, and every
-- reader/writer now uses `comments`; their Drizzle declarations are removed.
-- Archive-first, never DROP: each table moves to the `archive` schema with
-- its rows, indexes and constraints. Restore with
--   ALTER TABLE archive.<t> SET SCHEMA public;
--
-- The only inbound FK, feed_comment_reactions.comment_id, belongs to a table
-- archived by 0587; it is dropped here with any other live FK into the set
-- (the comment ids live on in comments / reactions.subject_id).

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
      AND tgt.relname IN ('booking_comments', 'feed_post_comments', 'review_comments', 'studio_review_comments')
      AND src.relname NOT IN ('booking_comments', 'feed_post_comments', 'review_comments', 'studio_review_comments')
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', r.src_table, r.conname);
  END LOOP;
END $$;

ALTER TABLE IF EXISTS public.booking_comments SET SCHEMA archive;
ALTER TABLE IF EXISTS public.feed_post_comments SET SCHEMA archive;
ALTER TABLE IF EXISTS public.review_comments SET SCHEMA archive;
ALTER TABLE IF EXISTS public.studio_review_comments SET SCHEMA archive;
