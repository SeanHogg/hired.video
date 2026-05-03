-- Studio Project Subjects — many-to-many link between studio projects
-- and the entities they're "about" (resume / profile / job / company /
-- skills_demo). Replaces the 1:1 `(subject_kind, subject_id)` pair on
-- studio_projects from migration 0056 (no in-prod data to preserve, so
-- we drop the legacy columns rather than carry them as a back-compat
-- read path).
--
-- Why a join table: a single video can legitimately be about multiple
-- entities (e.g. a personal-brand video also linked to a specific
-- resume + a target job). One pair per project couldn't model that.

CREATE TABLE IF NOT EXISTS studio_project_subjects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
  subject_kind    TEXT NOT NULL,                  -- 'resume' | 'profile' | 'job' | 'company' | 'skills_demo'
  subject_id      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_project_subjects_project
  ON studio_project_subjects(project_id);
CREATE INDEX IF NOT EXISTS idx_studio_project_subjects_subject
  ON studio_project_subjects(subject_kind, subject_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_studio_project_subjects_triple
  ON studio_project_subjects(project_id, subject_kind, subject_id);

-- Backfill from the legacy 1:1 pair (set by migration 0056) before we
-- drop the columns. Idempotent via the unique triple above.
INSERT INTO studio_project_subjects (project_id, subject_kind, subject_id)
SELECT id, subject_kind, subject_id
  FROM studio_projects
 WHERE subject_kind IS NOT NULL
   AND subject_id   IS NOT NULL
ON CONFLICT DO NOTHING;

-- Drop the legacy columns + their composite index. The join table is
-- now the single source of truth.
DROP INDEX IF EXISTS idx_studio_projects_subject;
ALTER TABLE studio_projects DROP COLUMN IF EXISTS subject_kind;
ALTER TABLE studio_projects DROP COLUMN IF EXISTS subject_id;
