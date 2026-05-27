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
-- before issuing ALTER COLUMN TYPE. Necessary because a previous run of
-- this migration partially landed in CI (29/31 statements applied;
-- youtube_accounts.user_id was already uuid via a prior drizzle-kit push)
-- and the file is now safe to re-execute regardless of column state.
-- FK ADD CONSTRAINT statements are wrapped in `IF NOT EXISTS` guards.
--
-- DRY: the same convert-text-userId-to-uuid logic appears across 10
-- tables (phone family + studio family + linkedin/youtube). Extracted
-- into a pg_temp helper function `__convert_text_user_id`; each table
-- becomes a one-liner call. Drops automatically when the session ends.
--
-- Closes #1603 and the FK-half of #1595's "still open" list.

-- ---------------------------------------------------------------------------
-- Helper: convert <table>.user_id from text → uuid (if still text), then
-- add the FK to users(id) ON DELETE CASCADE (if missing). Idempotent.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION pg_temp.__convert_text_user_id(target_table text)
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
    -- DELETE orphan rows: invalid UUID strings or refs to nonexistent
    -- users. Both predicates can be applied to text but only one of
    -- them to uuid, hence the gated execution.
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
SELECT pg_temp.__convert_text_user_id('business_phone_numbers');
SELECT pg_temp.__convert_text_user_id('call_logs');
SELECT pg_temp.__convert_text_user_id('sms_messages');
SELECT pg_temp.__convert_text_user_id('phone_balances');
SELECT pg_temp.__convert_text_user_id('phone_balance_transactions');

-- ---------------------------------------------------------------------------
-- Studio voice clones — user_id only (voice_clone_id case handled below)
-- ---------------------------------------------------------------------------
SELECT pg_temp.__convert_text_user_id('studio_voice_clones');

-- ---------------------------------------------------------------------------
-- studio_voice_clone_licenses — user_id (text→uuid) PLUS voice_clone_id
-- (already uuid, needs FK only). The user_id conversion goes through the
-- helper; the voice_clone_id orphan-clean + FK is one extra block.
-- ---------------------------------------------------------------------------
SELECT pg_temp.__convert_text_user_id('studio_voice_clone_licenses');

DO $$
BEGIN
  -- Drop orphans whose voice_clone_id no longer points at a real row.
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
-- studio_captions — user_id (helper) + project_id (text → uuid + FK).
-- project_id can't use the generic helper because its parent table is
-- studio_projects, not users; spell it out inline.
-- ---------------------------------------------------------------------------
SELECT pg_temp.__convert_text_user_id('studio_captions');

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
SELECT pg_temp.__convert_text_user_id('linkedin_accounts');
SELECT pg_temp.__convert_text_user_id('youtube_accounts');
