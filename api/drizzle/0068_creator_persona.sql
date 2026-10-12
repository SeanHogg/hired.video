-- Migration 0068 — Creator persona (profileMode + external public handle + YouTube ingest)
--
-- Per [project_creator_persona_model.md] the creator persona is NOT a
-- new role. It's a presentation mode (`profile_mode`) on the existing
-- job_seeker role.
--
-- `external_public_handle` is the channel-style handle used for `/u/<handle>`.
-- It is INTENTIONALLY separate from `user_profiles.custom_url_slug` because
-- the two serve different products (the slug is the profile vanity URL
-- used by articles/courses/services; the handle is the creator brand
-- identifier shown in channel-mode UIs). They may match initially via
-- the backfill below, but the user is free to diverge them later
-- without breaking anything that points at the slug.
--
-- YouTube-imported items live in their own table so the eventual
-- `creator_content` view can union native videos + YouTube ingests
-- under one recruiter-search index.
--
-- Schema only — every read/write goes through services/profile/
-- (resolveProfileMode, findUserByHandle, ingestYouTube). Routes never
-- touch these columns directly.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profile_mode VARCHAR(16) NOT NULL DEFAULT 'auto'
    CHECK (profile_mode IN ('resume', 'channel', 'auto'));

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS external_public_handle VARCHAR(64);

-- Backfill: seed the handle from `user_profiles.custom_url_slug` when
-- present (the user already chose a slug for their resume profile —
-- start the handle there so old links keep working). Otherwise derive
-- from name + a 6-char id suffix to guarantee uniqueness.
UPDATE users u
   SET external_public_handle = COALESCE(
         (SELECT up.custom_url_slug FROM user_profiles up WHERE up.user_id = u.id),
         LOWER(REGEXP_REPLACE(SPLIT_PART(u.name, ' ', 1), '[^a-zA-Z0-9]+', '-', 'g'))
           || '-' || SUBSTRING(u.id::text FROM 1 FOR 6)
       )
 WHERE external_public_handle IS NULL;

ALTER TABLE users
  ADD CONSTRAINT users_external_public_handle_unique UNIQUE (external_public_handle);

CREATE INDEX IF NOT EXISTS users_external_public_handle_idx
  ON users (external_public_handle);

-- ── YouTube ingest ────────────────────────────────────────────────────
--
-- One row per ingested YouTube video. Owned by a user (creator),
-- optionally tied to a `studio_project_subjects` creator_credit row
-- so the imported clip surfaces on the public channel page alongside
-- native videos. We store the embed metadata server-side at ingest
-- time so the channel page renders without an extra YouTube API call.

CREATE TABLE IF NOT EXISTS creator_youtube_ingests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  youtube_video_id VARCHAR(32) NOT NULL,
  source_url TEXT NOT NULL,
  title TEXT,
  description TEXT,
  thumbnail_url TEXT,
  channel_name TEXT,
  channel_url TEXT,
  -- Duration may be null when oEmbed didn't surface it. The channel
  -- page falls back to the YouTube player UI when so.
  duration_sec INTEGER,
  -- Sort key for the channel "Videos" tab. Defaults to ingest time so
  -- new pulls land at the top; can be overridden by the creator.
  display_order INTEGER NOT NULL DEFAULT 0,
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, youtube_video_id)
);

CREATE INDEX IF NOT EXISTS creator_youtube_ingests_user_idx
  ON creator_youtube_ingests (user_id, is_hidden, ingested_at DESC);
