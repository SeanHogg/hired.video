-- Migration 0203 — feed post reshare / repost.
--
-- A reshare is just another feed_posts row whose repost_of_id points at the
-- original. Optional `content` on the reshare row = a quote-repost (the
-- user's commentary above the embedded original); empty content = a plain
-- repost. Counting reshares = COUNT(*) WHERE repost_of_id = :id.
--
-- ON DELETE SET NULL: deleting the original leaves the reshare standing as a
-- normal post (the UI shows "original unavailable") rather than cascade-
-- deleting everyone's reshares.
--
-- Idempotent per drizzle/TEMPLATE.md.

ALTER TABLE feed_posts
  ADD COLUMN IF NOT EXISTS repost_of_id UUID
  REFERENCES feed_posts(id) ON DELETE SET NULL;

-- Reshare-count lookups + "find all reshares of X" filter.
CREATE INDEX IF NOT EXISTS idx_feed_posts_repost_of
  ON feed_posts (repost_of_id)
  WHERE repost_of_id IS NOT NULL;
