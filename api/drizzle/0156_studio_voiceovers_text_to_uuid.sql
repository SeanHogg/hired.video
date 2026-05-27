-- #1595 residual sweep — studio_voiceovers was missed in 0146.
--
-- studio_voiceovers.user_id was still text after pass 4. project_id same.
-- Same helper pattern as 0146, scoped per the TEMPLATE.md rules.

CREATE OR REPLACE FUNCTION public.__mig_0156_convert_text_user_id(target_table text)
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

SELECT public.__mig_0156_convert_text_user_id('studio_voiceovers');

-- studio_voiceovers.project_id — nullable text → uuid + FK SET NULL
-- (voiceovers can outlive their source project for audit purposes).
DO $$
DECLARE
  col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'studio_voiceovers' AND column_name = 'project_id';

  IF col_type = 'text' THEN
    UPDATE studio_voiceovers
    SET project_id = NULL
    WHERE project_id IS NOT NULL
      AND (project_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           OR NOT EXISTS (SELECT 1 FROM studio_projects WHERE studio_projects.id::text = studio_voiceovers.project_id));
    EXECUTE 'ALTER TABLE studio_voiceovers ALTER COLUMN project_id TYPE uuid USING NULLIF(project_id, '''')::uuid';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'studio_voiceovers_project_id_fkey') THEN
    ALTER TABLE studio_voiceovers
      ADD CONSTRAINT studio_voiceovers_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES studio_projects(id) ON DELETE SET NULL;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.__mig_0156_convert_text_user_id(text);
