-- 0640_entity_versions.sql
--
-- W3-E versions merge (architecture remediation 2026-10-17, gap #2410-#2417).
--
-- ONE polymorphic `entity_versions` table replaces three per-document
-- snapshot-history tables:
--   resume_versions          -> subject_type 'resume'         (resume_id;  payload = resume_data)
--   article_versions         -> subject_type 'article'        (article_id; payload = {title, bodyMd, bodyJson})
--   studio_project_versions  -> subject_type 'studio_project' (project_id; payload = storyboard)
-- Registry: shared/entity-version-subjects.ts. Schema:
-- api/src/db/schema/entityVersions.ts. Résumé-only columns (reviewer-proposed
-- drafts, #1946) carry over: proposed_by_user_id, review_id, proposal_status.
--
-- Row ids are carried over, so version ids held in URLs / client state keep
-- resolving. Backfill is idempotent (ON CONFLICT DO NOTHING on the carried id
-- and on the unique (subject_type, subject_id, version_number)) and skips any
-- source table that is already gone.
--
-- version_number becomes UNIQUE per subject. resume_versions already had that
-- unique index; article_versions and studio_project_versions did not, so a
-- duplicate (parent, version_number) row there keeps its number only for the
-- oldest copy — later copies are renumbered above the parent's current max
-- (the same rule scripts/unique-index-registry.mjs used for resume_versions).
--
-- Rows that can never be reached are skipped: studio_project_versions stored
-- project_id / user_id as text with no FK, so a row whose project_id or
-- user_id is not a uuid, whose project was deleted, or whose user no longer
-- exists is not copied (the old table never cascaded; those rows were
-- unreachable leftovers). Résumé / article rows had cascading FKs, so their
-- subject and user always exist.
--
-- Payloads stay in jsonb (no R2 offload): the résumé snapshot is a single
-- INSERT … SELECT from resume_information.content and autosave pruning is one
-- DELETE — both need the payload in-row.
--
-- The old subject FKs cascaded (résumé, article); a polymorphic subject has no
-- FK, so statement-level AFTER DELETE triggers on each subject table delete
-- the subject's versions instead (studio projects now cascade too).
--
-- CI runs `drizzle-kit push --force` first, so the table, indexes, FKs and
-- CHECKs normally already exist; every statement here is idempotent for the
-- no-push path. The old tables are archived (not dropped) by 0641.

CREATE TABLE IF NOT EXISTS public.entity_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type varchar(32) NOT NULL,
  subject_id uuid NOT NULL,
  user_id uuid NOT NULL CONSTRAINT entity_versions_user_id_users_id_fk
    REFERENCES public.users(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  label varchar(120),
  payload jsonb NOT NULL,
  is_autosave boolean NOT NULL DEFAULT false,
  proposed_by_user_id uuid CONSTRAINT entity_versions_proposed_by_user_id_users_id_fk
    REFERENCES public.users(id) ON DELETE SET NULL,
  review_id uuid,
  proposal_status varchar(16),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_entity_versions_subject_version
  ON public.entity_versions (subject_type, subject_id, version_number);
CREATE INDEX IF NOT EXISTS idx_entity_versions_subject
  ON public.entity_versions (subject_type, subject_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entity_versions_user_id ON public.entity_versions (user_id);
CREATE INDEX IF NOT EXISTS idx_entity_versions_proposed_by_user_id ON public.entity_versions (proposed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_entity_versions_review
  ON public.entity_versions (review_id) WHERE review_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'entity_versions_subject_type_check') THEN
    ALTER TABLE public.entity_versions ADD CONSTRAINT entity_versions_subject_type_check
      CHECK (subject_type IN ('resume', 'article', 'studio_project'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'entity_versions_proposal_status_check') THEN
    ALTER TABLE public.entity_versions ADD CONSTRAINT entity_versions_proposal_status_check
      CHECK (proposal_status IS NULL OR proposal_status IN ('proposed', 'accepted', 'rejected'));
  END IF;
END $$;

-- ── Backfill ───────────────────────────────────────────────────────────────

-- resume_versions: already unique on (resume_id, version_number) — copied as-is.
DO $$
BEGIN
  IF to_regclass('public.resume_versions') IS NOT NULL THEN
    EXECUTE $q$
      INSERT INTO public.entity_versions
        (id, subject_type, subject_id, user_id, version_number, label, payload, is_autosave,
         proposed_by_user_id, review_id, proposal_status, created_at)
      SELECT rv.id, 'resume', rv.resume_id, rv.user_id, rv.version_number, rv.label, rv.resume_data,
             rv.is_autosave,
             CASE WHEN EXISTS (SELECT 1 FROM public.users u WHERE u.id = rv.proposed_by_user_id)
                  THEN rv.proposed_by_user_id END,
             rv.review_id, rv.proposal_status, rv.created_at
      FROM public.resume_versions rv
      WHERE EXISTS (SELECT 1 FROM public.resume_information r WHERE r.id = rv.resume_id)
        AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = rv.user_id)
      ON CONFLICT DO NOTHING
    $q$;
  END IF;
END $$;

-- article_versions: duplicate (article_id, version_number) copies renumbered.
DO $$
BEGIN
  IF to_regclass('public.article_versions') IS NOT NULL THEN
    EXECUTE $q$
      WITH ranked AS (
        SELECT av.*,
               row_number() OVER (PARTITION BY av.article_id, av.version_number ORDER BY av.created_at, av.id) AS dup_rn
        FROM public.article_versions av
        WHERE EXISTS (SELECT 1 FROM public.articles a WHERE a.id = av.article_id)
          AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = av.user_id)
      ),
      numbered AS (
        SELECT r.*,
               CASE WHEN r.dup_rn = 1 THEN r.version_number
                    ELSE max(r.version_number) OVER (PARTITION BY r.article_id)
                         + row_number() OVER (PARTITION BY r.article_id, (r.dup_rn = 1) ORDER BY r.created_at, r.id)
               END AS new_version_number
        FROM ranked r
      )
      INSERT INTO public.entity_versions
        (id, subject_type, subject_id, user_id, version_number, label, payload, is_autosave, created_at)
      SELECT n.id, 'article', n.article_id, n.user_id, n.new_version_number, n.label,
             jsonb_build_object('title', n.title, 'bodyMd', n.body_md, 'bodyJson', n.body_json),
             n.is_autosave, n.created_at
      FROM numbered n
      ON CONFLICT DO NOTHING
    $q$;
  END IF;
END $$;

-- studio_project_versions: text ids validated before the uuid cast (CASE keeps
-- the cast from running on a non-uuid); duplicates renumbered; label capped
-- at 120 (the route always validated max 120).
DO $$
BEGIN
  IF to_regclass('public.studio_project_versions') IS NOT NULL THEN
    EXECUTE $q$
      WITH typed AS (
        SELECT sv.id,
               CASE WHEN sv.project_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                    THEN sv.project_id::uuid END AS project_uuid,
               CASE WHEN sv.user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                    THEN sv.user_id::uuid END AS user_uuid,
               sv.version_number, sv.label, sv.storyboard, sv.is_autosave, sv.created_at
        FROM public.studio_project_versions sv
      ),
      ranked AS (
        SELECT t.*,
               row_number() OVER (PARTITION BY t.project_uuid, t.version_number ORDER BY t.created_at, t.id) AS dup_rn
        FROM typed t
        WHERE t.project_uuid IS NOT NULL
          AND t.user_uuid IS NOT NULL
          AND EXISTS (SELECT 1 FROM public.studio_projects p WHERE p.id = t.project_uuid)
          AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = t.user_uuid)
      ),
      numbered AS (
        SELECT r.*,
               CASE WHEN r.dup_rn = 1 THEN r.version_number
                    ELSE max(r.version_number) OVER (PARTITION BY r.project_uuid)
                         + row_number() OVER (PARTITION BY r.project_uuid, (r.dup_rn = 1) ORDER BY r.created_at, r.id)
               END AS new_version_number
        FROM ranked r
      )
      INSERT INTO public.entity_versions
        (id, subject_type, subject_id, user_id, version_number, label, payload, is_autosave, created_at)
      SELECT n.id, 'studio_project', n.project_uuid, n.user_uuid, n.new_version_number,
             left(n.label, 120), n.storyboard, n.is_autosave, n.created_at
      FROM numbered n
      ON CONFLICT DO NOTHING
    $q$;
  END IF;
END $$;

-- ── Subject-delete cascade (replaces the old per-table subject FKs) ─────────

CREATE OR REPLACE FUNCTION public.entity_versions_subject_deleted() RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  DELETE FROM public.entity_versions v
  USING old_rows o
  WHERE v.subject_type = TG_ARGV[0] AND v.subject_id = o.id;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_entity_versions_subject_deleted ON public.resume_information;
CREATE TRIGGER trg_entity_versions_subject_deleted
  AFTER DELETE ON public.resume_information
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.entity_versions_subject_deleted('resume');

DROP TRIGGER IF EXISTS trg_entity_versions_subject_deleted ON public.articles;
CREATE TRIGGER trg_entity_versions_subject_deleted
  AFTER DELETE ON public.articles
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.entity_versions_subject_deleted('article');

DROP TRIGGER IF EXISTS trg_entity_versions_subject_deleted ON public.studio_projects;
CREATE TRIGGER trg_entity_versions_subject_deleted
  AFTER DELETE ON public.studio_projects
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.entity_versions_subject_deleted('studio_project');
