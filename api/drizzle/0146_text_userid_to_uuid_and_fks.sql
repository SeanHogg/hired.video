-- #1603 + remainder of #1595 — text user_id / project_id / voice_clone_id
-- columns get converted to uuid + given the missing FK constraints.
--
-- Scope explicitly excludes the actively-used surfaces (inbox integrations,
-- account profiles, resumes, studio templates) — those columns were already
-- uuid-typed. This migration covers the operational/inactive surfaces:
-- phone family, studio voice clones + licences + captions, LinkedIn /
-- YouTube account links.
--
-- Idempotence: every block checks `information_schema.columns.data_type`
-- before issuing ALTER COLUMN TYPE. Re-running this file against an
-- already-converted column is a safe no-op. FK ADD CONSTRAINT statements
-- are wrapped in `IF NOT EXISTS` guards.
--
-- Why `public.__mig_0146_*` instead of `pg_temp.*` (#1625): the migration
-- runner uses Neon's HTTP driver where each statement is a separate
-- request → separate backend → pg_temp functions die between statements.
-- Named functions in public schema are committed after CREATE and visible
-- to subsequent requests; we drop them at the end of the file so they
-- don't pollute the long-lived schema.
--
-- DRY: the same convert-text-userId-to-uuid logic appears across 10
-- tables. The helper consolidates it.
--
-- Closes #1603 and the FK-half of #1595's "still open" list.

CREATE OR REPLACE FUNCTION public.__mig_0146_convert_text_user_id(target_table text)
RETURNS void
LANGUAGE plpgsql
AS $func$
DECLARE
  col_type text;
  fk_name  text := target_table || '_user_id_fkey';
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = target_table AND column_name = 'user_id';

  IF col_type = 'text' THEN
    EXECUTE format(
      'DELETE FROM %I WHERE user_id IS NULL OR user_id !~ %L OR NOT EXISTS (SELECT 1 FROM users WHERE users.id::text = %I.user_id)',
      target_table,
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      target_table
    );

    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN user_id TYPE uuid USING NULLIF(user_id, %L)::uuid',
      target_table, ''
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = fk_name) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE',
      target_table, fk_name
    );
  END IF;
END;
$func$;

-- ---------------------------------------------------------------------------
-- Phone family
-- ---------------------------------------------------------------------------
SELECT public.__mig_0146_convert_text_user_id('business_phone_numbers');
SELECT public.__mig_0146_convert_text_user_id('call_logs');
SELECT public.__mig_0146_convert_text_user_id('sms_messages');
SELECT public.__mig_0146_convert_text_user_id('phone_balances');
SELECT public.__mig_0146_convert_text_user_id('phone_balance_transactions');

-- ---------------------------------------------------------------------------
-- Studio voice clones
-- ---------------------------------------------------------------------------
SELECT public.__mig_0146_convert_text_user_id('studio_voice_clones');

-- ---------------------------------------------------------------------------
-- studio_voice_clone_licenses — user_id (helper) PLUS voice_clone_id FK only.
-- ---------------------------------------------------------------------------
SELECT public.__mig_0146_convert_text_user_id('studio_voice_clone_licenses');

DO $$
BEGIN
  DELETE FROM studio_voice_clone_licenses
  WHERE NOT EXISTS (
    SELECT 1 FROM studio_voice_clones WHERE studio_voice_clones.id = studio_voice_clone_licenses.voice_clone_id
  );

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'studio_voice_clone_licenses_voice_clone_id_fkey') THEN
    ALTER TABLE studio_voice_clone_licenses
      ADD CONSTRAINT studio_voice_clone_licenses_voice_clone_id_fkey
      FOREIGN KEY (voice_clone_id) REFERENCES studio_voice_clones(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- studio_captions — user_id (helper) + project_id (inline since parent
-- is studio_projects, not users).
-- ---------------------------------------------------------------------------
SELECT public.__mig_0146_convert_text_user_id('studio_captions');

DO $$
DECLARE
  col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'studio_captions' AND column_name = 'project_id';

  IF col_type = 'text' THEN
    DELETE FROM studio_captions
    WHERE project_id IS NULL
       OR project_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR NOT EXISTS (SELECT 1 FROM studio_projects WHERE studio_projects.id::text = studio_captions.project_id);

    EXECUTE 'ALTER TABLE studio_captions ALTER COLUMN project_id TYPE uuid USING NULLIF(project_id, '''')::uuid';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'studio_captions_project_id_fkey') THEN
    ALTER TABLE studio_captions
      ADD CONSTRAINT studio_captions_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES studio_projects(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- OAuth account-link tables
-- ---------------------------------------------------------------------------
SELECT public.__mig_0146_convert_text_user_id('linkedin_accounts');
SELECT public.__mig_0146_convert_text_user_id('youtube_accounts');

-- Clean up the helper so it doesn't pollute the long-lived schema.
DROP FUNCTION IF EXISTS public.__mig_0146_convert_text_user_id(text);
