-- 0545_archive_orphan_tables.sql
--
-- W1-D data-model hygiene (architecture remediation 2026-10-17, gap #2410-#2417).
--
-- Seventeen tables were declared in the Drizzle schema but no code in api/,
-- frontend/, shared/, packages/ or scripts read or wrote them — neither by
-- their TS const nor by raw table name in SQL. Their declarations were removed
-- from api/src/db/schema in the same change, so `drizzle-kit push` (limited to
-- declared tables by drizzle.config.ts tablesFilter, and to the public schema
-- by schemaFilter) no longer manages them.
--
-- Archive-first, never DROP: each table moves to the `archive` schema with its
-- rows, indexes and constraints intact. Restoring one is a single
--   ALTER TABLE archive.<t> SET SCHEMA public;
--
-- Two live tables had a foreign key into an archived table; both are dropped
-- first so no live write depends on an archived row:
--   * talent_pool_candidates.pool_id  -> recruiter_talent_pools (column unused)
--   * job_board_postings.board_id     -> job_boards (routes/exclusive-boards.ts
--     writes an exclusive_boards.id there, which this FK rejected)

CREATE SCHEMA IF NOT EXISTS archive;

-- Drop every FK on a table outside the archive set that points INTO it,
-- whatever the constraint is called in a given database.
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
        'role_permission_overrides', 'profile_views', 'dashboard_metrics',
        'user_engagement_metrics', 'usage_records', 'workspace_compliance_policy',
        'workspace_email_safety_policy', 'email_push_subscriptions',
        'integration_credentials', 'integration_runs', 'job_websites',
        'postal_zip_codes', 'application_notes', 'paid_media_audiences',
        'job_boards', 'queue_job_to_resume', 'recruiter_talent_pools'
      )
      AND src.relname NOT IN (
        'role_permission_overrides', 'profile_views', 'dashboard_metrics',
        'user_engagement_metrics', 'usage_records', 'workspace_compliance_policy',
        'workspace_email_safety_policy', 'email_push_subscriptions',
        'integration_credentials', 'integration_runs', 'job_websites',
        'postal_zip_codes', 'application_notes', 'paid_media_audiences',
        'job_boards', 'queue_job_to_resume', 'recruiter_talent_pools'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', r.src_table, r.conname);
  END LOOP;
END $$;

ALTER TABLE IF EXISTS public.role_permission_overrides SET SCHEMA archive;
ALTER TABLE IF EXISTS public.profile_views SET SCHEMA archive;
ALTER TABLE IF EXISTS public.dashboard_metrics SET SCHEMA archive;
ALTER TABLE IF EXISTS public.user_engagement_metrics SET SCHEMA archive;
ALTER TABLE IF EXISTS public.usage_records SET SCHEMA archive;
ALTER TABLE IF EXISTS public.workspace_compliance_policy SET SCHEMA archive;
ALTER TABLE IF EXISTS public.workspace_email_safety_policy SET SCHEMA archive;
ALTER TABLE IF EXISTS public.email_push_subscriptions SET SCHEMA archive;
ALTER TABLE IF EXISTS public.integration_credentials SET SCHEMA archive;
ALTER TABLE IF EXISTS public.integration_runs SET SCHEMA archive;
ALTER TABLE IF EXISTS public.job_websites SET SCHEMA archive;
ALTER TABLE IF EXISTS public.postal_zip_codes SET SCHEMA archive;
ALTER TABLE IF EXISTS public.application_notes SET SCHEMA archive;
ALTER TABLE IF EXISTS public.paid_media_audiences SET SCHEMA archive;
ALTER TABLE IF EXISTS public.job_boards SET SCHEMA archive;
ALTER TABLE IF EXISTS public.queue_job_to_resume SET SCHEMA archive;
ALTER TABLE IF EXISTS public.recruiter_talent_pools SET SCHEMA archive;
