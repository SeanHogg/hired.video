-- Migration: YouTube OAuth connections + per-video published metadata (#202)
--
-- Mirrors `linkedin_accounts` for the YouTube Data API v3 publishing flow.
-- One user may connect multiple Google accounts (channels). Refresh token is
-- stored long-term; access token is rotated lazily inside the publish handler.

CREATE TABLE IF NOT EXISTS youtube_accounts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           TEXT NOT NULL,
  google_id         TEXT NOT NULL,                                    -- Google `sub`
  channel_id        TEXT,                                             -- YT channel ID once known
  channel_title     TEXT,
  display_name      TEXT,
  email             TEXT,
  access_token      TEXT NOT NULL,
  refresh_token     TEXT,
  token_expires_at  TIMESTAMPTZ,
  scopes            TEXT,                                             -- space-separated scope list
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, google_id)
);

CREATE INDEX IF NOT EXISTS idx_youtube_accounts_user ON youtube_accounts (user_id);
