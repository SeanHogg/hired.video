-- Migration: 0033_feed_polymorphic_subjects
--
-- Phase B of the polymorphic content rollout. Lets a `feed_posts` row
-- be a *pointer* to a polymorphic subject (review, video, resume,
-- voice clone, …) rather than a free-form text post. The renderer
-- branches on `subject_type` and inlines the canonical card for that
-- type (e.g. a review post embeds <ReviewCard> + the threaded
-- <ReviewComments>, so comments live in `review_comments`, not
-- `feed_post_comments`).
--
-- `embed_payload` caches the minimal display data (title, rating,
-- excerpt, …) so the feed list query is one round trip — without it,
-- rendering the feed would N+1 over `reviews` for every review post.
-- The cache is recomputed at write time (review save) by the API.
--
-- Existing free-form feed posts (subject_type IS NULL) continue to
-- work unchanged; comments on those still go through
-- `feed_post_comments` as before.

ALTER TABLE feed_posts ADD COLUMN IF NOT EXISTS subject_type  varchar(32);
ALTER TABLE feed_posts ADD COLUMN IF NOT EXISTS subject_id    uuid;
ALTER TABLE feed_posts ADD COLUMN IF NOT EXISTS embed_payload jsonb;

-- Lookup query is "find the feed post for this subject" — we hit it
-- on every review save (upsert) and delete. Partial index because
-- the vast majority of pre-Phase-B rows are NULL.
CREATE INDEX IF NOT EXISTS idx_feed_posts_subject
  ON feed_posts (subject_type, subject_id)
  WHERE subject_type IS NOT NULL;
