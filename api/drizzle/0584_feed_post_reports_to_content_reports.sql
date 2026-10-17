-- 0584_feed_post_reports_to_content_reports.sql
--
-- W3-A engagement merges (architecture remediation 2026-10-17, gap #2410-#2417).
--
-- Feed post abuse reports lived in their own `feed_post_reports` table, which
-- the moderation queue (/api/moderation/reports, content_reports) never saw.
-- Fold them into the polymorphic `content_reports` (entity_type 'feed_post',
-- already in shared/moderation.ts REPORT_ENTITY_TYPES); POST
-- /api/feed/posts/:id/report now files through the moderation service.
--
-- Mapping:
--   id           -> id (carried over)
--   user_id      -> reporter_id
--   feed_post_id -> entity_id, entity_type 'feed_post'
--   feed_posts.user_id -> entity_owner_id (owner snapshot, as fileReport does)
--   reason       -> reason when it is a REPORT_REASONS value, else 'other'
--                   with the free-text reason kept in notes
--   details      -> notes
--   status 'pending' (feed reports were never triaged)
--
-- Idempotent: ON CONFLICT DO NOTHING covers the carried-over id and the
-- uq_content_reports_active (reporter, entity) key, so a reporter who also
-- filed through the moderation dialog keeps a single active report.
-- feed_post_reports is archived (not dropped) by 0589.

DO $$
BEGIN
  IF to_regclass('public.feed_post_reports') IS NOT NULL THEN
    EXECUTE $q$
      INSERT INTO public.content_reports
        (id, reporter_id, entity_type, entity_id, entity_owner_id, reason, notes, status, created_at, updated_at)
      SELECT fr.id, fr.user_id, 'feed_post', fr.feed_post_id, p.user_id,
             CASE WHEN fr.reason IN ('spam', 'impersonation', 'inappropriate', 'harassment', 'copyright', 'other')
                  THEN fr.reason ELSE 'other' END,
             NULLIF(concat_ws(E'\n',
               CASE WHEN fr.reason IN ('spam', 'impersonation', 'inappropriate', 'harassment', 'copyright', 'other')
                    THEN NULL ELSE 'Reason: ' || fr.reason END,
               fr.details), ''),
             'pending', fr.created_at, fr.created_at
      FROM public.feed_post_reports fr
      JOIN public.feed_posts p ON p.id = fr.feed_post_id
      WHERE EXISTS (SELECT 1 FROM public.users u WHERE u.id = fr.user_id)
      ON CONFLICT DO NOTHING
    $q$;
  END IF;
END $$;
