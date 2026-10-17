-- 0601_archive_provider_connection_tables.sql
--
-- W3-C provider connections (architecture remediation 2026-10-17, gap #2410-#2417).
--
-- 0600 copied every row of the eleven per-feature credential tables into
-- `provider_connections` (ids carried over), repointed the inbound FKs and
-- moved adopt_guest_user onto the merged table; every reader and writer now
-- goes through ProviderConnectionsRepository, and the tables' Drizzle
-- declarations are removed.
--
-- Archive-first, never DROP: each table moves to the `archive` schema with its
-- rows, indexes and constraints (and its legacy ciphertext / plaintext token
-- columns). Restore with
--   ALTER TABLE archive.<t> SET SCHEMA public;
--
-- NOTE for the owner: 0549_clear_plaintext_credentials.sql and
-- 0578_clear_plaintext_ats_webhook_secret.sql name tables archived here. Do
-- NOT approve them after this file has run (they would fail on a missing
-- relation); approve 0602_clear_legacy_plaintext_connection_secrets.sql
-- instead once scripts/backfill-credential-encryption.ts reports 0.

CREATE SCHEMA IF NOT EXISTS archive;

-- Drop every FK on a live table that still points INTO a table being
-- archived, whatever it is called in a given database (0545 pattern).
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
        'oauth_accounts', 'calendar_connections', 'youtube_accounts', 'lms_connectors',
        'ats_connections', 'company_integrations', 'tenant_integrations',
        'paid_media_connections', 'social_connections', 'managed_accounts',
        'external_email_accounts'
      )
      AND src.relname NOT IN (
        'oauth_accounts', 'calendar_connections', 'youtube_accounts', 'lms_connectors',
        'ats_connections', 'company_integrations', 'tenant_integrations',
        'paid_media_connections', 'social_connections', 'managed_accounts',
        'external_email_accounts'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', r.src_table, r.conname);
  END LOOP;
END $$;

ALTER TABLE IF EXISTS public.oauth_accounts SET SCHEMA archive;
ALTER TABLE IF EXISTS public.calendar_connections SET SCHEMA archive;
ALTER TABLE IF EXISTS public.youtube_accounts SET SCHEMA archive;
ALTER TABLE IF EXISTS public.lms_connectors SET SCHEMA archive;
ALTER TABLE IF EXISTS public.ats_connections SET SCHEMA archive;
ALTER TABLE IF EXISTS public.company_integrations SET SCHEMA archive;
ALTER TABLE IF EXISTS public.tenant_integrations SET SCHEMA archive;
ALTER TABLE IF EXISTS public.paid_media_connections SET SCHEMA archive;
ALTER TABLE IF EXISTS public.social_connections SET SCHEMA archive;
ALTER TABLE IF EXISTS public.managed_accounts SET SCHEMA archive;
ALTER TABLE IF EXISTS public.external_email_accounts SET SCHEMA archive;
