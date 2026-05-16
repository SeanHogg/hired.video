-- 0086 — videos.is_public: collapse the redundant boolean.
--
-- The videos table tracked visibility on TWO columns:
--   - `privacy_status` (varchar — "public" | "unlisted" | "private")
--   - `is_public`     (boolean)
--
-- Both meant the same thing, but writers and readers disagreed about
-- which was canonical. The publish-insert at studio.ts ~line 1587 set
-- only `privacy_status`, so a freshly-published row had
-- `privacy_status='public'` AND `is_public=false` (column default).
-- Meanwhile the channel page (channels.ts) and the profile-mode signal
-- counter filtered on `is_public`, while the homepage public feed and
-- search filtered on `privacy_status`. Net result: a published video
-- appeared on the homepage but was invisible on the user's profile.
--
-- All readers in this commit moved to `privacy_status`. The boolean
-- is no longer read or written, so we reconcile + drop it.

-- Reconcile any rows that drifted before today's commit. If `is_public`
-- says public but `privacy_status` doesn't, trust `is_public` — the
-- channel page already showed the video to its owner, so the user
-- intent was public.
UPDATE videos
  SET privacy_status = 'public'
  WHERE is_public = true
    AND (privacy_status IS NULL OR privacy_status <> 'public');

-- Backfill any nulls left behind by inserts that ran before
-- `privacy_status` had a column default.
UPDATE videos
  SET privacy_status = 'unlisted'
  WHERE privacy_status IS NULL;

-- Tighten the canonical column so future inserts can't reintroduce
-- nullability drift. The default already matches the historical value.
ALTER TABLE videos
  ALTER COLUMN privacy_status SET DEFAULT 'unlisted',
  ALTER COLUMN privacy_status SET NOT NULL;

-- Drop the redundant column.
ALTER TABLE videos DROP COLUMN is_public;
