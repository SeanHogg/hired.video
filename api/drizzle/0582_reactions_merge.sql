-- 0582_reactions_merge.sql
--
-- W3-A engagement merges (architecture remediation 2026-10-17, gap #2410-#2417).
--
-- ONE polymorphic `reactions` table replaces three per-surface tables:
--   feed_post_likes         -> subject_type 'feed_post' (feed_post_id), count 1
--   feed_comment_reactions  -> subject_type 'comment'   (comment_id = a
--                              comments.id — 0581 carried the comment ids over)
--   article_claps           -> subject_type 'article'   (article_id),
--                              reaction_type 'clap', count = running clap total
-- Registry: shared/engagement-subjects.ts (REACTION_SUBJECT_TYPES,
-- REACTION_TYPES). Schema: api/src/db/schema/reactions.ts.
--
-- Uniqueness is unchanged: one row per (subject, user) — every old table was
-- unique on (subject, user). Row ids are carried over; the backfill is
-- idempotent (ON CONFLICT DO NOTHING on the id or the (subject, user) key).
-- article_engagement.clap_count (the denormalised daily counter) is untouched.
--
-- Statement-level AFTER DELETE triggers on the subject tables replace the old
-- subject FKs' ON DELETE CASCADE. The old tables are archived by 0587.

CREATE TABLE IF NOT EXISTS public.reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type varchar(32) NOT NULL,
  subject_id uuid NOT NULL,
  user_id uuid NOT NULL CONSTRAINT reactions_user_id_users_id_fk REFERENCES public.users(id) ON DELETE CASCADE,
  reaction_type varchar(24) NOT NULL DEFAULT 'like',
  count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reactions_subject_type_check
    CHECK (subject_type IN ('feed_post', 'comment', 'article')),
  CONSTRAINT reactions_reaction_type_check
    CHECK (reaction_type IN ('like', 'celebrate', 'support', 'insightful', 'curious', 'funny', 'clap')),
  CONSTRAINT reactions_count_check CHECK (count >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reactions_subject_user ON public.reactions (subject_type, subject_id, user_id);
CREATE INDEX IF NOT EXISTS idx_reactions_subject ON public.reactions (subject_type, subject_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reactions_user_id ON public.reactions (user_id);

-- ── Backfill ───────────────────────────────────────────────────────────────
-- Unknown legacy reaction types fall back to 'like' (the feed default) so the
-- CHECK never rejects a backfilled row.

DO $$
BEGIN
  IF to_regclass('public.feed_post_likes') IS NOT NULL THEN
    EXECUTE $q$
      INSERT INTO public.reactions
        (id, subject_type, subject_id, user_id, reaction_type, count, created_at, updated_at)
      SELECT l.id, 'feed_post', l.feed_post_id, l.user_id,
             CASE WHEN l.reaction_type IN ('like', 'celebrate', 'support', 'insightful', 'curious', 'funny')
                  THEN l.reaction_type ELSE 'like' END,
             1, l.created_at, l.created_at
      FROM public.feed_post_likes l
      WHERE EXISTS (SELECT 1 FROM public.feed_posts p WHERE p.id = l.feed_post_id)
        AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = l.user_id)
      ON CONFLICT DO NOTHING
    $q$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.feed_comment_reactions') IS NOT NULL THEN
    EXECUTE $q$
      INSERT INTO public.reactions
        (id, subject_type, subject_id, user_id, reaction_type, count, created_at, updated_at)
      SELECT r.id, 'comment', r.comment_id, r.user_id,
             CASE WHEN r.reaction_type IN ('like', 'celebrate', 'support', 'insightful', 'curious', 'funny')
                  THEN r.reaction_type ELSE 'like' END,
             1, r.created_at, r.created_at
      FROM public.feed_comment_reactions r
      WHERE EXISTS (SELECT 1 FROM public.comments c WHERE c.id = r.comment_id)
        AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = r.user_id)
      ON CONFLICT DO NOTHING
    $q$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.article_claps') IS NOT NULL THEN
    EXECUTE $q$
      INSERT INTO public.reactions
        (id, subject_type, subject_id, user_id, reaction_type, count, created_at, updated_at)
      SELECT ac.id, 'article', ac.article_id, ac.user_id, 'clap', GREATEST(ac.count, 0),
             ac.created_at, ac.updated_at
      FROM public.article_claps ac
      WHERE EXISTS (SELECT 1 FROM public.articles a WHERE a.id = ac.article_id)
        AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = ac.user_id)
      ON CONFLICT DO NOTHING
    $q$;
  END IF;
END $$;

-- ── Subject-delete cascade (replaces the old per-table subject FKs) ─────────

CREATE OR REPLACE FUNCTION public.reactions_subject_deleted() RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  DELETE FROM public.reactions r
  USING old_rows o
  WHERE r.subject_type = TG_ARGV[0] AND r.subject_id = o.id;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_reactions_subject_deleted ON public.feed_posts;
CREATE TRIGGER trg_reactions_subject_deleted
  AFTER DELETE ON public.feed_posts
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.reactions_subject_deleted('feed_post');

DROP TRIGGER IF EXISTS trg_reactions_subject_deleted ON public.comments;
CREATE TRIGGER trg_reactions_subject_deleted
  AFTER DELETE ON public.comments
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.reactions_subject_deleted('comment');

DROP TRIGGER IF EXISTS trg_reactions_subject_deleted ON public.articles;
CREATE TRIGGER trg_reactions_subject_deleted
  AFTER DELETE ON public.articles
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.reactions_subject_deleted('article');
