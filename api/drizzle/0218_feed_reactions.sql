-- Migration 0218 — professional feed reactions (posts + comments).
--
-- A plain heart/like reads as casual social-media engagement. The feed now
-- carries a professional reaction vocabulary (like / celebrate / support /
-- insightful / curious / funny) defined in shared/feed-reactions.ts.
--
--   feed_post_likes.reaction_type     — repurposes the existing likes table.
--                                       Backfilled to 'like' so every prior
--                                       like reads as a Like. The (post,user)
--                                       unique index already enforces one
--                                       reaction per user; changing a reaction
--                                       UPDATEs reaction_type in place.
--
--   feed_comment_reactions            — new table; comments are now reactable
--                                       with the same set. One reaction per
--                                       (comment, user).
--
-- Idempotent per drizzle/TEMPLATE.md.

-- ── Post reactions: add the discriminator to the existing likes table ──
ALTER TABLE feed_post_likes
  ADD COLUMN IF NOT EXISTS reaction_type VARCHAR(24) NOT NULL DEFAULT 'like';

-- ── Comment reactions ──
CREATE TABLE IF NOT EXISTS feed_comment_reactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id    UUID NOT NULL REFERENCES feed_post_comments(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction_type VARCHAR(24) NOT NULL DEFAULT 'like',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One reaction per (comment, user); changing a reaction UPDATEs in place.
CREATE UNIQUE INDEX IF NOT EXISTS uq_feed_comment_reactions_comment_user
  ON feed_comment_reactions (comment_id, user_id);

-- Batched "reactions for these comments" lookups (no N+1 on thread render).
CREATE INDEX IF NOT EXISTS idx_feed_comment_reactions_comment
  ON feed_comment_reactions (comment_id);

-- Trending ranking reads reactions grouped by post over a recent window;
-- the (post,user) unique index already covers the GROUP BY feed_post_id.
