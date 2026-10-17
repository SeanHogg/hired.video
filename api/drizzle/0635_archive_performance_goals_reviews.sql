-- 0635_archive_performance_goals_reviews.sql
--
-- W3-D2 (architecture remediation 2026-10-17): retire the user-scoped
-- performance engine. 0634 backfilled performance_goals -> people_goals and
-- performance_reviews -> people_performance_reviews (ids carried over); every
-- reader/writer now goes through the canonical people_* tables and the
-- declarations were removed from api/src/db/schema/performance.ts.
--
-- Archive-first, never DROP: rows that could not be placed on a roster (user
-- with no people_employees row) remain readable in archive.*. Restore with
--   ALTER TABLE archive.<t> SET SCHEMA public;
--
-- Neither table has inbound foreign keys; the defensive loop below drops any
-- that a given database may still carry so no live write depends on an
-- archived row. Their own FKs (to users / performance_cycles) travel with them.

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
      AND tgt.relname IN ('performance_goals', 'performance_reviews')
      AND src.relname NOT IN ('performance_goals', 'performance_reviews')
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', r.src_table, r.conname);
  END LOOP;
END $$;

ALTER TABLE IF EXISTS public.performance_goals SET SCHEMA archive;
ALTER TABLE IF EXISTS public.performance_reviews SET SCHEMA archive;
