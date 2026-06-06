-- Migration 0196 — per-destination publish record for Studio projects.
--
-- Before this, publishing a Studio project to YouTube / LinkedIn / Profile
-- left no durable record of WHERE it went: the success toast fired and the
-- destination URL (YouTube watch link, LinkedIn post, on-platform /v/ link)
-- was discarded. Re-publishing couldn't tell "same vs new" because nothing
-- captured the external id/url, and the editor had no way to surface
-- "you published this to X — view it here".
--
-- This table is the single source of truth for "where has this project been
-- published". ONE row per (project, destination) — re-publishing UPSERTs the
-- same row (updates external_id/url/published_at in place), so the history is
-- "current state per destination", not an append log. `destination` matches
-- the shared `PublishDestinationId` union (youtube / linkedin / profile / …).
--
-- Idempotent per drizzle/TEMPLATE.md.

CREATE TABLE IF NOT EXISTS studio_project_publications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The project this publication belongs to. Cascade so deleting the
  -- project tears down its publication records.
  project_id    UUID NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
  -- One of shared `PublishDestinationId` (youtube / linkedin / profile / …).
  destination   VARCHAR(48) NOT NULL,
  -- Provider-side identifier when the destination has one (YouTube video id,
  -- LinkedIn post urn/id). Null for on-platform destinations (profile).
  external_id   TEXT,
  -- The user-facing "view / preview where it landed" URL. For on-platform
  -- profile publishes this is the /v/<slug|id> link; for YouTube the watch
  -- URL; for LinkedIn the feed-update URL.
  external_url  TEXT,
  -- 'published' (live) | 'failed' (attempt recorded for diagnostics) |
  -- 'pending' (in-flight). Kept as a varchar mirror of the client enum.
  status        VARCHAR(24) NOT NULL DEFAULT 'published',
  published_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per (project, destination) — the recorder UPSERTs on this
-- constraint so re-publishing updates in place rather than duplicating.
CREATE UNIQUE INDEX IF NOT EXISTS uq_studio_project_publications_proj_dest
  ON studio_project_publications (project_id, destination);

-- The editor lists a project's publications on open; index the FK for the
-- by-project read.
CREATE INDEX IF NOT EXISTS idx_studio_project_publications_project
  ON studio_project_publications (project_id);
