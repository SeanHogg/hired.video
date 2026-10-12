-- Feed post "kind" discriminator (gap #1828).
--
-- Until now text / video / article posts were all stored identically — the
-- composer's "article" mode was a UI-only label that persisted nothing
-- distinct, so the feed could neither filter by kind nor render article
-- posts as long-form. This column makes the kind a first-class, queryable
-- property.
--
-- Allowed values: 'text' | 'video' | 'article'. Backfill is best-effort:
-- existing rows default to 'text', and any post that already carries a Video
-- media item is promoted to 'video' so historical reels keep their identity.
ALTER TABLE feed_posts
  ADD COLUMN IF NOT EXISTS kind varchar(16) NOT NULL DEFAULT 'text';

UPDATE feed_posts
SET kind = 'video'
WHERE kind = 'text'
  AND media::text LIKE '%"mediaType":"Video"%';
