-- Migration 0192 — page → video embed registry (#1860).
--
-- A SuperAdmin can publish a generated Studio video onto a marketing page
-- by route. The shared <MarketingPageVideo> component (mounted once in
-- AppShell) resolves the active mapping for the current pathname and
-- renders the video — no per-page .tsx edits, self-gating when absent.
--
-- One active mapping per path (the public resolver reads by pathname).
-- `is_active=false` lets an operator unpublish without losing history of
-- which project was placed where.
--
-- Idempotent per drizzle/TEMPLATE.md.

CREATE TABLE IF NOT EXISTS page_embed_videos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The marketing-page route this video renders on (e.g. "/pricing").
  pathname     VARCHAR(512) NOT NULL,
  -- The Studio project that renders the video. Cascade so deleting the
  -- project tears down its placement.
  project_id   UUID NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
  -- Denormalised published video id for the public resolver's fast read;
  -- null until the project has been rendered + published.
  video_id     UUID REFERENCES videos(id) ON DELETE SET NULL,
  -- Where on the page it renders. "hero" = banner above page content.
  placement    VARCHAR(24) NOT NULL DEFAULT 'hero',
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per path — POST upserts on this constraint.
CREATE UNIQUE INDEX IF NOT EXISTS uq_page_embed_videos_path
  ON page_embed_videos (pathname);
