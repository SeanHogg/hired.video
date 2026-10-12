-- #1607 + #1611 + #1595 residual — three small bundle:
--   1. studio_ats_packages.slug — promote non-unique idx_studio_ats_slug
--      to a UNIQUE index. The schema comment says "unique URL slug" but
--      only a regular `index` was declared. Slug is generated as
--      `${candidate}-${Date.now().toString(36)}` (low collision risk),
--      but DB-side enforcement matches the contract the comment claims.
--   2. studio_ats_packages.user_id + project_id text → uuid + FKs.
--      Closes the studio-residual of #1595. Bundled here per Full-fix
--      scope since the table is already being altered for (1).
--   3. resume_match_scores — plain indexes on user_id and job_id. The
--      composite unique on (user_id, job_id, resume_id) covers point
--      lookups but the "all my match scores" and "all matches for
--      this job" rollup queries need per-column indexes.
--
-- Idempotent: every block uses CREATE INDEX IF NOT EXISTS / DROP INDEX
-- IF EXISTS / pg_constraint checks + the same pg_temp.__convert_text_user_id
-- helper pattern as 0146 (helper is session-scoped, redefined here).

-- ---------------------------------------------------------------------------
-- studio_ats_packages — promote slug to unique
-- ---------------------------------------------------------------------------

-- Pre-flight: if any duplicate slugs slipped through during the
-- non-unique era, collapse to the oldest row. Idempotent — re-runs
-- against a deduped table delete nothing.
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY slug ORDER BY created_at, id) AS rn
  FROM studio_ats_packages
)
DELETE FROM studio_ats_packages
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Drop the non-unique idx; the unique one below covers the same lookup.
DROP INDEX IF EXISTS idx_studio_ats_slug;

CREATE UNIQUE INDEX IF NOT EXISTS uq_studio_ats_packages_slug
  ON studio_ats_packages (slug);

-- ---------------------------------------------------------------------------
-- studio_ats_packages — text → uuid for user_id and project_id (#1595)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.__mig_0149_convert_text_user_id(target_table text)
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

SELECT public.__mig_0149_convert_text_user_id('studio_ats_packages');

-- project_id text → uuid + FK to studio_projects(id).
DO $$
DECLARE
  col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'studio_ats_packages' AND column_name = 'project_id';

  IF col_type = 'text' THEN
    DELETE FROM studio_ats_packages
    WHERE project_id IS NULL
       OR project_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR NOT EXISTS (SELECT 1 FROM studio_projects WHERE studio_projects.id::text = studio_ats_packages.project_id);

    EXECUTE 'ALTER TABLE studio_ats_packages ALTER COLUMN project_id TYPE uuid USING NULLIF(project_id, '''')::uuid';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'studio_ats_packages_project_id_fkey') THEN
    ALTER TABLE studio_ats_packages
      ADD CONSTRAINT studio_ats_packages_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES studio_projects(id) ON DELETE CASCADE;
  END IF;
END $$;

-- The old `idx_studio_ats_user` lookup index was declared with `text`
-- user_id — recreate it (CREATE INDEX IF NOT EXISTS won't replace an
-- existing index, but the type change above doesn't drop the index).
-- No-op when the index already exists with the right column type.

-- ---------------------------------------------------------------------------
-- resume_match_scores — plain indexes for rollup queries (#1611)
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_resume_match_scores_user
  ON resume_match_scores (user_id);

CREATE INDEX IF NOT EXISTS idx_resume_match_scores_job
  ON resume_match_scores (job_id);

-- Cleanup migration-scoped helper.
DROP FUNCTION IF EXISTS public.__mig_0149_convert_text_user_id(text);
