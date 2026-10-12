-- Migration 0461 — internal-advertising schema drift: wrong column types +
-- missing parent FKs on the ad_campaigns → ad_sets → ads hierarchy (gap #982).
--
-- The internal-boost tables were created in 0015 with the WRONG types compared
-- to the rest of the schema:
--   * ad_campaigns.user_id / ad_sets.user_id / ads.user_id were `text`, while
--     every other user_id in the schema is `uuid` (see boosts.user_id).
--   * ad_sets.campaign_id and ads.ad_set_id were `text` with NO foreign key to
--     their parents — so deleting a campaign left dangling ad_sets/ads.
--
-- This migration converts the typed surface to match the Drizzle source
-- (api/src/db/schema/advertising.ts) and installs the missing cascade FKs:
--   (a) ad_campaigns/ad_sets/ads .user_id : text → uuid
--   (b) ad_sets.campaign_id : text → uuid REFERENCES ad_campaigns(id) ON DELETE CASCADE
--   (c) ads.ad_set_id       : text → uuid REFERENCES ad_sets(id)       ON DELETE CASCADE
--
-- Internal advertising is NOT in the active-feature set, so unattributable /
-- malformed rows are deleted top-down (ads → ad_sets → ad_campaigns) before the
-- casts and FK adds, guaranteeing neither the `::uuid` cast nor the FK can fail
-- on legacy data.
--
-- Idempotent per drizzle/TEMPLATE.md: every cast is gated on the column still
-- being `text` (the predicate plan-time-fails once converted, so we guard with a
-- data_type check) and every FK add is gated on pg_constraint. Re-running against
-- a DB where this work already landed (the same logic shipped in 0150) is a
-- complete no-op.

-- DRY helper: convert a text user_id column → uuid (orphan-clean + cast).
-- The owning-user FK to users(id) is installed by 0150's own user_id helper;
-- this migration is concerned with the type drift + the missing PARENT FKs, so
-- the user FK add is left to that path and merely re-asserted idempotently below.
CREATE OR REPLACE FUNCTION public.__mig_0461_text_userid_to_uuid(target_table text)
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
    -- Drop unattributable / malformed owner rows so the cast can't fail.
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

-- DRY helper: convert a text parent-pointer column → uuid + cascade FK.
-- Deletes child rows whose pointer is null/malformed/orphaned BEFORE adding the
-- FK so the constraint can't fail on legacy data.
CREATE OR REPLACE FUNCTION public.__mig_0461_text_fk_to_uuid(
  target_table  text,
  fk_column     text,
  parent_table  text,
  parent_column text
) RETURNS void
LANGUAGE plpgsql
AS $func$
DECLARE
  col_type text;
  fk_name  text := target_table || '_' || fk_column || '_fkey';
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = target_table AND column_name = fk_column;

  IF col_type = 'text' THEN
    EXECUTE format(
      'DELETE FROM %I WHERE %I IS NULL OR %I !~ %L OR NOT EXISTS (SELECT 1 FROM %I WHERE %I.%I::text = %I.%I)',
      target_table, fk_column, fk_column,
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      parent_table, parent_table, parent_column, target_table, fk_column
    );
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(%I, %L)::uuid',
      target_table, fk_column, fk_column, ''
    );
  ELSE
    -- Already uuid: still purge orphans so a later FK add can't fail.
    EXECUTE format(
      'DELETE FROM %I WHERE %I IS NULL OR NOT EXISTS (SELECT 1 FROM %I WHERE %I.%I = %I.%I)',
      target_table, fk_column,
      parent_table, parent_table, parent_column, target_table, fk_column
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = fk_name) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(%I) ON DELETE CASCADE',
      target_table, fk_name, fk_column, parent_table, parent_column
    );
  END IF;
END;
$func$;

-- (a) user_id : text → uuid (+ user FK re-asserted). Top-down so child deletes
--     don't strand rows the next level still expects.
SELECT public.__mig_0461_text_userid_to_uuid('ad_campaigns');
SELECT public.__mig_0461_text_userid_to_uuid('ad_sets');
SELECT public.__mig_0461_text_userid_to_uuid('ads');

-- (b) ad_sets.campaign_id : text → uuid REFERENCES ad_campaigns(id) CASCADE.
SELECT public.__mig_0461_text_fk_to_uuid('ad_sets', 'campaign_id', 'ad_campaigns', 'id');

-- (c) ads.ad_set_id : text → uuid REFERENCES ad_sets(id) CASCADE.
SELECT public.__mig_0461_text_fk_to_uuid('ads', 'ad_set_id', 'ad_sets', 'id');

-- Cleanup migration-scoped helpers.
DROP FUNCTION IF EXISTS public.__mig_0461_text_userid_to_uuid(text);
DROP FUNCTION IF EXISTS public.__mig_0461_text_fk_to_uuid(text, text, text, text);
