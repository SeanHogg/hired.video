-- #1595 residual — advertising tables text → uuid + missing FKs.
--
-- Tables converted: boosts, job_boosts, company_boosts, ad_campaigns,
-- ad_sets, ads, enrichment_credits, enrichment_transactions, career_resilience_reports.
--
-- Pattern is identical to 0146 + 0149; same `public.__mig_0150_convert_text_user_id`
-- helper. Advertising is not in the active-feature list (per the user's
-- "only inbox / profiles / resumes / studio templates are in active use"
-- scope), so orphan-DELETE pre-flights are safe.
--
-- Parent-pointer columns that aren't user_id (job_id, company_id,
-- campaign_id, ad_set_id) each get a small inline DO block since the
-- generic helper only knows about user_id.

CREATE OR REPLACE FUNCTION public.__mig_0150_convert_text_user_id(target_table text)
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

-- Reusable helper: convert a non-user FK column (e.g. job_id → jobs,
-- campaign_id → ad_campaigns). Pass the FK column name, the parent
-- table, the parent column, and the desired ON DELETE behavior.
CREATE OR REPLACE FUNCTION public.__mig_0150_convert_text_fk(
  target_table   text,
  fk_column      text,
  parent_table   text,
  parent_column  text,
  on_delete      text
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
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = fk_name) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(%I) ON DELETE %s',
      target_table, fk_name, fk_column, parent_table, parent_column, on_delete
    );
  END IF;
END;
$func$;

-- ---------------------------------------------------------------------------
-- boosts — user_id is uuid already (per pass-1 schema), just missing FK.
-- ---------------------------------------------------------------------------
SELECT public.__mig_0150_convert_text_user_id('boosts');

-- ---------------------------------------------------------------------------
-- job_boosts — user_id + job_id text → uuid + FKs.
-- ---------------------------------------------------------------------------
SELECT public.__mig_0150_convert_text_user_id('job_boosts');
SELECT public.__mig_0150_convert_text_fk('job_boosts', 'job_id', 'job_items', 'id', 'CASCADE');

-- ---------------------------------------------------------------------------
-- company_boosts — user_id + company_id text → uuid + FKs.
-- ---------------------------------------------------------------------------
SELECT public.__mig_0150_convert_text_user_id('company_boosts');
SELECT public.__mig_0150_convert_text_fk('company_boosts', 'company_id', 'company_profiles', 'id', 'CASCADE');

-- ---------------------------------------------------------------------------
-- ad_campaigns — user_id text → uuid + FK.
-- ---------------------------------------------------------------------------
SELECT public.__mig_0150_convert_text_user_id('ad_campaigns');

-- ---------------------------------------------------------------------------
-- ad_sets — user_id + campaign_id text → uuid + FKs.
-- ---------------------------------------------------------------------------
SELECT public.__mig_0150_convert_text_user_id('ad_sets');
SELECT public.__mig_0150_convert_text_fk('ad_sets', 'campaign_id', 'ad_campaigns', 'id', 'CASCADE');

-- ---------------------------------------------------------------------------
-- ads — user_id + ad_set_id text → uuid + FKs.
-- ---------------------------------------------------------------------------
SELECT public.__mig_0150_convert_text_user_id('ads');
SELECT public.__mig_0150_convert_text_fk('ads', 'ad_set_id', 'ad_sets', 'id', 'CASCADE');

-- ---------------------------------------------------------------------------
-- enrichment_credits + enrichment_transactions — user_id text → uuid + FK.
-- enrichment_credits has a UNIQUE on user_id; the type change preserves it.
-- ---------------------------------------------------------------------------
SELECT public.__mig_0150_convert_text_user_id('enrichment_credits');
SELECT public.__mig_0150_convert_text_user_id('enrichment_transactions');

-- ---------------------------------------------------------------------------
-- career_resilience_reports — user_id text → uuid + FK.
-- ---------------------------------------------------------------------------
SELECT public.__mig_0150_convert_text_user_id('career_resilience_reports');
