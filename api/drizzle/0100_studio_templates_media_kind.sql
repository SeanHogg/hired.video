-- Migration 0100 — `studio_templates.media_kind` mirrors the studio_projects axis.
--
-- Per Consolidated Gap Register #913: the mediaKind axis lives on
-- studio_projects.media_kind (migration 0099) but the parallel
-- `studio_templates` table — the creator-published template marketplace
-- rows — had no such column. Effect today: a creator who publishes a
-- Podcast template from a `mediaKind: 'podcast'` source project would
-- have the resulting row show up as Video in /studio's Type filter
-- (the chooser hardcoded mediaKind="video" for every owned template
-- pending this column).
--
-- This migration mirrors the studio_projects shape exactly: varchar(16)
-- default 'video' NOT NULL + CHECK constraint enforcing the union +
-- partial index on non-default values for the upcoming per-kind chooser.
--
-- Backfill: every pre-#913 row gets media_kind = 'video' via the column
-- default, which is correct — every existing template was authored from
-- a video project.

ALTER TABLE "studio_templates"
  ADD COLUMN IF NOT EXISTS "media_kind" varchar(16) DEFAULT 'video' NOT NULL;

ALTER TABLE "studio_templates"
  DROP CONSTRAINT IF EXISTS "studio_templates_media_kind_check";
ALTER TABLE "studio_templates"
  ADD CONSTRAINT "studio_templates_media_kind_check"
  CHECK ("media_kind" IN ('video', 'podcast', 'voice', 'animation'));

CREATE INDEX IF NOT EXISTS "idx_studio_templates_media_kind"
  ON "studio_templates" ("media_kind")
  WHERE "media_kind" <> 'video';
