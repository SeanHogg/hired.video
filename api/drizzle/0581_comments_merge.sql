-- 0581_comments_merge.sql
--
-- W3-A engagement merges (architecture remediation 2026-10-17, gap #2410-#2417).
--
-- ONE polymorphic `comments` table replaces four per-surface comment tables:
--   booking_comments        -> subject_type 'booking_reservation' (reservation_id)
--   feed_post_comments      -> subject_type 'feed_post'           (feed_post_id)
--   review_comments         -> subject_type 'review'              (review_id)
--   studio_review_comments  -> subject_type 'studio_project'      (project_id)
-- Registry: shared/engagement-subjects.ts (COMMENT_SUBJECT_TYPES). Schema:
-- api/src/db/schema/comments.ts.
--
-- Row ids are carried over, so parent_id reply links, comment URLs and the
-- feed comment reactions (reactions.subject_type = 'comment', 0582) keep
-- resolving. Backfill is idempotent (ON CONFLICT DO NOTHING on the carried
-- id) and skips any source table that is already gone. Rows whose subject no
-- longer exists are skipped (the old FKs cascaded, so there should be none).
--
-- The old tables had FKs to their subject with ON DELETE CASCADE; a
-- polymorphic subject has no FK, so statement-level AFTER DELETE triggers on
-- each subject table delete the subject's comments instead (replies go with
-- their parent through the parent_id self-FK).
--
-- The old tables are archived (not dropped) by 0586 once nothing reads them.

CREATE TABLE IF NOT EXISTS public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type varchar(32) NOT NULL,
  subject_id uuid NOT NULL,
  parent_id uuid CONSTRAINT comments_parent_id_comments_id_fk REFERENCES public.comments(id) ON DELETE CASCADE,
  author_user_id uuid CONSTRAINT comments_author_user_id_users_id_fk REFERENCES public.users(id) ON DELETE CASCADE,
  author_kind varchar(8),
  author_name text,
  author_email text,
  body text NOT NULL,
  timestamp_sec real,
  resolved boolean NOT NULL DEFAULT false,
  is_subject_owner boolean NOT NULL DEFAULT false,
  status varchar(20) NOT NULL DEFAULT 'published',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comments_subject_type_check
    CHECK (subject_type IN ('booking_reservation', 'feed_post', 'review', 'studio_project')),
  CONSTRAINT comments_author_kind_check
    CHECK (author_kind IS NULL OR author_kind IN ('host', 'booker'))
);

CREATE INDEX IF NOT EXISTS idx_comments_subject ON public.comments (subject_type, subject_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON public.comments (parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_author_user_id ON public.comments (author_user_id);

-- ── Backfill ───────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.booking_comments') IS NOT NULL THEN
    EXECUTE $q$
      INSERT INTO public.comments
        (id, subject_type, subject_id, parent_id, author_user_id, author_kind, body, created_at, updated_at)
      SELECT bc.id, 'booking_reservation', bc.reservation_id, NULL,
             CASE WHEN EXISTS (SELECT 1 FROM public.users u WHERE u.id = bc.author_user_id) THEN bc.author_user_id END,
             bc.author_kind, bc.body_md, bc.created_at, bc.created_at
      FROM public.booking_comments bc
      WHERE EXISTS (SELECT 1 FROM public.booking_reservations r WHERE r.id = bc.reservation_id)
      ON CONFLICT DO NOTHING
    $q$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.feed_post_comments') IS NOT NULL THEN
    EXECUTE $q$
      INSERT INTO public.comments
        (id, subject_type, subject_id, parent_id, author_user_id, body, created_at, updated_at)
      SELECT fc.id, 'feed_post', fc.feed_post_id, NULL, fc.user_id, fc.content, fc.created_at, fc.updated_at
      FROM public.feed_post_comments fc
      WHERE EXISTS (SELECT 1 FROM public.feed_posts p WHERE p.id = fc.feed_post_id)
        AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = fc.user_id)
      ON CONFLICT DO NOTHING
    $q$;
  END IF;
END $$;

-- Replies reference their parent's carried-over id; the self-FK is checked
-- at the end of the INSERT statement, so row order inside it is irrelevant.
DO $$
BEGIN
  IF to_regclass('public.review_comments') IS NOT NULL THEN
    EXECUTE $q$
      INSERT INTO public.comments
        (id, subject_type, subject_id, parent_id, author_user_id, body, is_subject_owner, status, created_at, updated_at)
      SELECT rc.id, 'review', rc.review_id, rc.parent_id, rc.user_id, rc.body,
             rc.is_subject_owner, rc.status, rc.created_at, rc.updated_at
      FROM public.review_comments rc
      WHERE EXISTS (SELECT 1 FROM public.reviews r WHERE r.id = rc.review_id)
        AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = rc.user_id)
      ON CONFLICT DO NOTHING
    $q$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.studio_review_comments') IS NOT NULL THEN
    EXECUTE $q$
      INSERT INTO public.comments
        (id, subject_type, subject_id, parent_id, author_user_id, author_name, author_email,
         body, timestamp_sec, resolved, created_at, updated_at)
      SELECT sc.id, 'studio_project', sc.project_id,
             CASE WHEN EXISTS (SELECT 1 FROM public.studio_review_comments p WHERE p.id = sc.parent_id) THEN sc.parent_id END,
             CASE WHEN EXISTS (SELECT 1 FROM public.users u WHERE u.id = sc.author_user_id) THEN sc.author_user_id END,
             sc.author_name, sc.author_email, sc.body, sc.timestamp_sec, sc.resolved, sc.created_at, sc.created_at
      FROM public.studio_review_comments sc
      WHERE EXISTS (SELECT 1 FROM public.studio_projects p WHERE p.id = sc.project_id)
      ON CONFLICT DO NOTHING
    $q$;
  END IF;
END $$;

-- ── Subject-delete cascade (replaces the old per-table subject FKs) ─────────

CREATE OR REPLACE FUNCTION public.comments_subject_deleted() RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  DELETE FROM public.comments c
  USING old_rows o
  WHERE c.subject_type = TG_ARGV[0] AND c.subject_id = o.id;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_comments_subject_deleted ON public.booking_reservations;
CREATE TRIGGER trg_comments_subject_deleted
  AFTER DELETE ON public.booking_reservations
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.comments_subject_deleted('booking_reservation');

DROP TRIGGER IF EXISTS trg_comments_subject_deleted ON public.feed_posts;
CREATE TRIGGER trg_comments_subject_deleted
  AFTER DELETE ON public.feed_posts
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.comments_subject_deleted('feed_post');

DROP TRIGGER IF EXISTS trg_comments_subject_deleted ON public.reviews;
CREATE TRIGGER trg_comments_subject_deleted
  AFTER DELETE ON public.reviews
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.comments_subject_deleted('review');

DROP TRIGGER IF EXISTS trg_comments_subject_deleted ON public.studio_projects;
CREATE TRIGGER trg_comments_subject_deleted
  AFTER DELETE ON public.studio_projects
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.comments_subject_deleted('studio_project');
