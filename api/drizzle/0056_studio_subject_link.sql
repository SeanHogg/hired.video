-- Studio Project Subject Link Migration (Roadmap #269)
--
-- Generalises the existing `studio_projects.resume_id` link into a
-- polymorphic (subject_kind, subject_id) pair that covers every entity
-- a creator can spin a video off of: resume / profile / job / company /
-- skills_demo. Existing `resume_id` stays in place as a back-compat
-- read path; new writes populate the polymorphic pair so future entity
-- types don't need another column.
--
-- The pair is nullable — projects that aren't linked to anything (e.g.
-- a free-form personal-brand video) just leave both null.

ALTER TABLE studio_projects ADD COLUMN IF NOT EXISTS subject_kind TEXT;
ALTER TABLE studio_projects ADD COLUMN IF NOT EXISTS subject_id   TEXT;

CREATE INDEX IF NOT EXISTS idx_studio_projects_subject
  ON studio_projects(subject_kind, subject_id);

-- Backfill: any row that already has a resume_id is, by definition, a
-- subject = resume project. Populate the pair from the legacy column so
-- the EntityVideos scroller on the Resume card works for pre-existing
-- projects without a manual one-time job.
UPDATE studio_projects
   SET subject_kind = 'resume',
       subject_id   = resume_id::text
 WHERE subject_kind IS NULL
   AND resume_id IS NOT NULL;
