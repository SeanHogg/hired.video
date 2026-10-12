-- 0531_drop_legacy_pitch_columns_and_resume_templates.sql — #2385.
--
-- Second-deploy cleanup after 0519 (pitch → studio_projects) and 0520
-- (resume_templates → studio_templates, same ids). Nothing reads or writes
-- these leftovers: pitches are studio projects with is_current_pitch, and
-- résumé templates are studio_templates rows with document_kind = 'resume'.
--
-- They could not drop in the same deploy as 0519/0520 because CI runs
-- `drizzle-kit push --force` BEFORE the SQL migrations, so removing the
-- schema declarations then would drop the data before the copy. This file
-- is the follow-up.
--
-- What this file does, in order:
--   1. Refuse to drop if 0519 has not backfilled remaining video_pitch_url
--      values (or never added is_current_pitch). Skipped when the columns
--      are already gone (push dropped them this deploy).
--   2. Refuse to drop if 0520 has not copied every resume_templates row
--      into studio_templates (or never added document_kind). Skipped when
--      the table is already gone.
--   3. Drop leftover tool_runs FKs to resume_templates (0520 already did;
--      IF EXISTS so a re-run / push-recreated constraint is a no-op).
--   4. NULL orphan tool_runs.template_id rows that do not exist in
--      studio_templates (nullable column — TEMPLATE.md "Adding FK with
--      orphan-clean"), then add tool_runs.template_id → studio_templates(id)
--      ON DELETE CASCADE. Name matches drizzle-kit
--      (`tool_runs_template_id_studio_templates_id_fk`) so a later schema
--      `.references()` does not rewrite it. pg_constraint-gated (rule 2).
--   5. DROP users.video_pitch_url / video_pitch_set_at (rule 4: IF EXISTS).
--   6. DROP resume_templates. No CASCADE — fail loud if an unexpected FK
--      still points at it. Indexes and the created_by FK die with the table.
--
-- Same-deploy schema work (NOT this file; drizzle-kit push runs first):
--   - delete videoPitchUrl / videoPitchSetAt from api/src/db/schema/users.ts
--   - delete the resumeTemplates pgTable from api/src/db/schema/resumes.ts
--   - optionally add templateId.references(() => studioTemplates.id) on
--     tool-runs.ts AFTER this SQL has nulled orphans; declaring it in the
--     same deploy as this file lets push try the FK before the orphan-clean
--     and abort if any template_id is missing from studio_templates.
-- Without those schema deletions, the next `drizzle-kit push --force` will
-- recreate the empty columns/table because this file is already in
-- `_sql_migrations` and will not re-drop them.
--
-- Not @owner-gated: the RAISE EXCEPTION guards below hold the drops until
-- 0519/0520 have actually copied the data. Idempotent per TEMPLATE.md
-- (IF EXISTS / pg_constraint). No BEGIN/COMMIT — the runner applies
-- statement by statement.

-- 1. 0519 must have backfilled remaining pitches --------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'users'
       AND column_name = 'video_pitch_url'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'studio_projects'
         AND column_name = 'is_current_pitch'
    ) THEN
      RAISE EXCEPTION '0531: 0519 has not added studio_projects.is_current_pitch; refuse to drop users.video_pitch_url';
    END IF;
    IF EXISTS (
      SELECT 1 FROM users u
       WHERE u.video_pitch_url IS NOT NULL
         AND btrim(u.video_pitch_url) <> ''
         AND NOT EXISTS (
           SELECT 1 FROM studio_projects sp
            WHERE sp.user_id = u.id AND sp.is_current_pitch = true
         )
    ) THEN
      RAISE EXCEPTION '0531: users.video_pitch_url still has values not backfilled by 0519';
    END IF;
  END IF;
END $$;

-- 2. 0520 must have copied every resume_templates row --------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'resume_templates'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'studio_templates'
         AND column_name = 'document_kind'
    ) THEN
      RAISE EXCEPTION '0531: 0520 has not added studio_templates.document_kind; refuse to drop resume_templates';
    END IF;
    IF EXISTS (
      SELECT 1 FROM resume_templates rt
       WHERE NOT EXISTS (SELECT 1 FROM studio_templates st WHERE st.id = rt.id)
    ) THEN
      RAISE EXCEPTION '0531: resume_templates still has rows not copied into studio_templates — 0520 incomplete';
    END IF;
  END IF;
END $$;

-- 3. leftover FKs from tool_runs → resume_templates ----------------------------

ALTER TABLE tool_runs DROP CONSTRAINT IF EXISTS tool_runs_template_id_fkey;
ALTER TABLE tool_runs DROP CONSTRAINT IF EXISTS tool_runs_template_id_resume_templates_id_fk;

-- 4. point tool_runs.template_id at studio_templates ---------------------------

UPDATE tool_runs
   SET template_id = NULL
 WHERE template_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM studio_templates st WHERE st.id = tool_runs.template_id
   );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'tool_runs_template_id_studio_templates_id_fk'
  ) THEN
    ALTER TABLE tool_runs
      ADD CONSTRAINT tool_runs_template_id_studio_templates_id_fk
      FOREIGN KEY (template_id) REFERENCES studio_templates(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 5. drop legacy pitch columns -------------------------------------------------

ALTER TABLE users DROP COLUMN IF EXISTS video_pitch_url;
ALTER TABLE users DROP COLUMN IF EXISTS video_pitch_set_at;

-- 6. drop legacy résumé-templates table ----------------------------------------

DROP TABLE IF EXISTS resume_templates;
