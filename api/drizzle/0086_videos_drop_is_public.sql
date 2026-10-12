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
--
-- Idempotency: this migration runs on every deploy until the runner
-- gains an `_migrations` ledger (gap #697). The reconcile + DROP are
-- wrapped in `DO $$ ... END $$` guards that short-circuit when
-- `videos.is_public` no longer exists — same pattern other rewrite
-- migrations use here (see 0085).

-- Reconcile any rows that drifted before today's commit. If `is_public`
-- says public but `privacy_status` doesn't, trust `is_public` — the
-- channel page already showed the video to its owner, so the user
-- intent was public.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'videos' AND column_name = 'is_public'
  ) THEN
    UPDATE videos
      SET privacy_status = 'public'
      WHERE is_public = true
        AND (privacy_status IS NULL OR privacy_status <> 'public');
  END IF;
END $$;

-- Backfill any nulls left behind by inserts that ran before
-- `privacy_status` had a column default. Safe to re-run — a no-op
-- once every row has a value.
UPDATE videos
  SET privacy_status = 'unlisted'
  WHERE privacy_status IS NULL;

-- Tighten the canonical column so future inserts can't reintroduce
-- nullability drift. The default already matches the historical value.
-- ALTER ... SET DEFAULT / SET NOT NULL are idempotent in Postgres
-- (they're no-ops if the constraint already matches).
ALTER TABLE videos
  ALTER COLUMN privacy_status SET DEFAULT 'unlisted',
  ALTER COLUMN privacy_status SET NOT NULL;

-- Drop the redundant column. Guarded so re-runs of this migration
-- (until #697 lands a ledger) don't trip over the already-dropped
-- column.
ALTER TABLE videos DROP COLUMN IF EXISTS is_public;
