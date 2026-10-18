-- 0616_feed_post_tags.sql
--
-- W3-D1. The feed hashtag filter (listVisiblePosts) and trending tags read
-- (selectTrendingTags) unnested feed_posts.tags with jsonb_array_elements on
-- every call. Hashtags move to feed_post_tags(post_id, tag) — one row per
-- distinct lowercased hashtag — maintained by
-- repositories/feedPostTagsRepository.ts on every post write that sets tags.
-- workspace_tags / tag_assignments were considered and rejected: they are
-- per-workspace colored recruiter labels, hashtags are global free text.
-- feed_posts.tags stays (the feed card renders it; mentions + community
-- channel markers live there too). created_at copies the post's so the
-- 30-day trending window reads this table alone.
--
-- Idempotent backfill: ON CONFLICT on the (post_id, tag) natural key.

CREATE TABLE IF NOT EXISTS feed_post_tags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  tag        varchar(100) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_feed_post_tags_post_tag ON feed_post_tags (post_id, tag);
CREATE INDEX IF NOT EXISTS idx_feed_post_tags_tag_created ON feed_post_tags (tag, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_post_tags_created ON feed_post_tags (created_at DESC);

INSERT INTO feed_post_tags (post_id, tag, created_at)
SELECT DISTINCT ON (p.id, lower(left(btrim(t->>'tagValue'), 100)))
       p.id, lower(left(btrim(t->>'tagValue'), 100)), p.created_at
FROM feed_posts p
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(p.tags) = 'array' THEN p.tags ELSE '[]'::jsonb END
) AS t
WHERE jsonb_typeof(t) = 'object'
  AND t->>'tagType' = 'Hashtag'
  AND coalesce(btrim(t->>'tagValue'), '') <> ''
ON CONFLICT (post_id, tag) DO NOTHING;
