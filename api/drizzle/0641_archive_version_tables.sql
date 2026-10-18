-- 0641_archive_version_tables.sql
--
-- W3-E versions merge (architecture remediation 2026-10-17): resume_versions,
-- article_versions and studio_project_versions were merged into
-- `entity_versions` by 0640 and every reader/writer (résumé snapshots +
-- reviewer proposals, article versions, studio versions) now uses
-- entity_versions. Their Drizzle declarations are gone, so push no longer
-- manages them, and their entry left scripts/unique-index-registry.mjs.
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
      AND tgt.relname IN ('resume_versions', 'article_versions', 'studio_project_versions')
      AND src.relname NOT IN ('resume_versions', 'article_versions', 'studio_project_versions')
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', r.src_table, r.conname);
  END LOOP;
END $$;

ALTER TABLE IF EXISTS public.resume_versions SET SCHEMA archive;
ALTER TABLE IF EXISTS public.article_versions SET SCHEMA archive;
ALTER TABLE IF EXISTS public.studio_project_versions SET SCHEMA archive;
