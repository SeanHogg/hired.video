-- #1594 — Data-model audit, batch 1: composite indexes + CHECK constraints.
--
-- Pure additions only. No column drops, no type changes, no FK changes.
-- This migration is safe to apply against production with no pre-flight
-- data audit because:
--   - Every CREATE INDEX uses IF NOT EXISTS.
--   - Every CHECK is added as NOT VALID so existing rows aren't validated.
--     Validation can be promoted to VALIDATE CONSTRAINT in a later pass
--     once we've audited live data and either fixed or backfilled the
--     violators.
--
-- Closes / partially closes:
--   #1598 (polymorphic + content_locations indexes / CHECKs)
--   #1599 (composite (actorId, createdAt DESC) indexes on hot tables)
--   #1597 (userConnections status CHECK — uniqueness is in 0143)
--   #1596 (onboarding numeric defaults — type fix is in 0145)
--
-- Skipped here on purpose:
--   - feed_posts.subject_type / boosts.subject_type CHECK — no centralised
--     descriptor enum yet (reviews + content_locations have one, these
--     don't). Re-enabled when those enums get extracted to shared.
--   - reviews already has (subject_type, subject_id, created_at) and
--     (subject_type, subject_id, user_id) uniqueness — verified at
--     api/src/db/schema/reviews.ts:82-85. Skipped.

-- ---------------------------------------------------------------------------
-- Polymorphic composite indexes (gap #1598)
-- ---------------------------------------------------------------------------

-- feed_posts: "all posts about subject X, newest first" — every embed
-- render and every notification-aggregation walk. Without this every
-- read on a subject's feed was a full table scan + sort.
CREATE INDEX IF NOT EXISTS idx_feed_posts_subject
  ON feed_posts (subject_type, subject_id, created_at DESC)
  WHERE subject_type IS NOT NULL;

-- feed_post_comments: "comments on post X, newest first" — replaces the
-- single-column feed_post_id lookup which then had to sort in memory.
CREATE INDEX IF NOT EXISTS idx_feed_post_comments_post_created
  ON feed_post_comments (feed_post_id, created_at DESC);

-- boosts: existing idx_boosts_subject covers (subject_type, subject_id)
-- but not createdAt. The renderer query orders by spend window + created.
CREATE INDEX IF NOT EXISTS idx_boosts_subject_created
  ON boosts (subject_type, subject_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- "List my X newest-first" composite indexes (gap #1599)
-- ---------------------------------------------------------------------------

-- ai_chat_messages: every session render is a paged read of this table
-- by (session_id, created_at). FK index on session_id alone forced a
-- sort step on every load.
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_session_created
  ON ai_chat_messages (session_id, created_at);

-- call_logs / sms_messages: existing indexes are per-column, never
-- composite. Dashboard "my recent calls" pages were sort-after-scan.
CREATE INDEX IF NOT EXISTS idx_call_logs_user_created
  ON call_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sms_messages_user_created
  ON sms_messages (user_id, created_at DESC);

-- points_streaks: the nightly streak-reset sweep walks rows where
-- last_activity_date < today-1. Without an index it's a full scan of
-- every user with a streak row.
CREATE INDEX IF NOT EXISTS idx_points_streaks_last_activity
  ON points_streaks (last_activity_date)
  WHERE last_activity_date IS NOT NULL;

-- ---------------------------------------------------------------------------
-- CHECK constraints — NOT VALID so we don't fail on legacy rows.
-- ---------------------------------------------------------------------------

-- content_locations.entity_kind must match CONTENT_LOCATION_KINDS in
-- shared/content-locations.ts. If you add a kind there, update this
-- CHECK in a new migration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_locations_entity_kind_check'
  ) THEN
    ALTER TABLE content_locations
      ADD CONSTRAINT content_locations_entity_kind_check
      CHECK (entity_kind IN (
        'job', 'resume', 'video', 'service', 'article', 'voice',
        'template', 'talent_pool_candidate', 'user_profile', 'company', 'event'
      )) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_locations_role_check'
  ) THEN
    ALTER TABLE content_locations
      ADD CONSTRAINT content_locations_role_check
      CHECK (role IN ('origin', 'serves')) NOT VALID;
  END IF;
END $$;

-- reviews.subject_type must match shared/reviews/subject-descriptors.ts
-- SubjectType. Same maintenance contract as above.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reviews_subject_type_check'
  ) THEN
    ALTER TABLE reviews
      ADD CONSTRAINT reviews_subject_type_check
      CHECK (subject_type IN (
        'company', 'promo_project', 'service', 'voice_clone', 'article',
        'resume_template', 'video_template', 'course', 'certification'
      )) NOT VALID;
  END IF;
END $$;

-- reviews.overall_rating is "1..5 stars". No CHECK previously — junk
-- ratings like 99 silently inserted. Closes the rating half of #1608.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reviews_overall_rating_range'
  ) THEN
    ALTER TABLE reviews
      ADD CONSTRAINT reviews_overall_rating_range
      CHECK (overall_rating BETWEEN 1 AND 5) NOT VALID;
  END IF;
END $$;

-- reviews.status is "published" | "hidden" | "removed". Inline comment
-- says so but nothing enforced it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reviews_status_check'
  ) THEN
    ALTER TABLE reviews
      ADD CONSTRAINT reviews_status_check
      CHECK (status IN ('published', 'hidden', 'removed')) NOT VALID;
  END IF;
END $$;

-- user_connections.status — Pending | Accepted | Rejected per the
-- inline comment at users.ts:369. Uniqueness on (from_user_id,
-- to_user_id) is in migration 0143 (needs a pre-flight dedup).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_connections_status_check'
  ) THEN
    ALTER TABLE user_connections
      ADD CONSTRAINT user_connections_status_check
      CHECK (status IN ('Pending', 'Accepted', 'Rejected')) NOT VALID;
  END IF;
END $$;

-- onboarding_checklists.completion_percentage — 0..100. The Drizzle
-- schema declares default "0" (string) which Postgres stores as 0
-- numeric, but the absence of a range CHECK lets pathological values
-- like -1 or 100000 stick around silently.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'onboarding_checklists_completion_pct_range'
  ) THEN
    ALTER TABLE onboarding_checklists
      ADD CONSTRAINT onboarding_checklists_completion_pct_range
      CHECK (completion_percentage IS NULL
             OR (completion_percentage >= 0 AND completion_percentage <= 100))
      NOT VALID;
  END IF;
END $$;
