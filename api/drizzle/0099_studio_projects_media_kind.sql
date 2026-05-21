-- Migration 0099 — `studio_projects.media_kind` for the new mediaKind axis.
--
-- Per Consolidated Gap Register #894: studio_projects currently only
-- carries `kind: 'scene' | 'nle'` which is a STORAGE discriminator (which
-- editor surface authored the row, which JSONB column to read). The
-- orthogonal question — "what kind of output does this project produce?"
-- — has no column and is hardcoded to MP4 everywhere downstream.
--
-- This migration adds the column with a 'video' default so every existing
-- row keeps its current behaviour. The new Podcast / Voice / Animation
-- mediaKinds land alongside their first template entries (#894 phasing,
-- step 2+). The frontend / API derive output profiles + publish
-- destinations from this column via `shared/media-kinds.ts`.
--
-- Allowed values today: 'video' | 'podcast' | 'voice' | 'animation'. The
-- check constraint enforces the union at the DB level so a buggy client
-- can't write garbage. Adding a kind = ALTER the constraint in the same
-- changeset that lands the new TEMPLATE_CATALOG entry.

ALTER TABLE "studio_projects"
  ADD COLUMN IF NOT EXISTS "media_kind" varchar(16) DEFAULT 'video' NOT NULL;

-- Constrain the column to the registered union. Failing fast at the DB
-- boundary beats a stray string sneaking through every consumer.
ALTER TABLE "studio_projects"
  DROP CONSTRAINT IF EXISTS "studio_projects_media_kind_check";
ALTER TABLE "studio_projects"
  ADD CONSTRAINT "studio_projects_media_kind_check"
  CHECK ("media_kind" IN ('video', 'podcast', 'voice', 'animation'));

-- Filtered listings ("show me my podcast projects") will be a common
-- query path for the upcoming per-kind landing surfaces; partial index
-- on non-default values keeps the working set tiny.
CREATE INDEX IF NOT EXISTS "idx_studio_projects_media_kind"
  ON "studio_projects" ("media_kind")
  WHERE "media_kind" <> 'video';
