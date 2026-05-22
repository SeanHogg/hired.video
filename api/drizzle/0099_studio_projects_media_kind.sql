-- Migration 0099 — `studio_projects.media_kind` for the new mediaKind axis.
--
-- Per Consolidated Gap Register #894: studio_projects currently only
-- carries `kind: 'scene' | 'nle'` which is a STORAGE discriminator (which
-- editor surface authored the row, which JSONB column to read). The
-- orthogonal question — "what kind of output does this project produce?"
-- — has no column and is hardcoded to MP4 everywhere downstream.
--
-- This migration adds the column with a 'video' default so every existing
-- row keeps its current behaviour. The new Podcast / Voice / Animation /
-- Game / Comic / Image mediaKinds land alongside their first template
-- entries (#894 phasing). The frontend / API derive output profiles +
-- publish destinations from this column via `shared/media-kinds.ts`.
--
-- HISTORICAL NOTE (2026-05-22, gap #960): this migration originally
-- shipped a CHECK constraint hardcoding the 4 kinds known at the time
-- ('video' | 'podcast' | 'voice' | 'animation'). Production gained
-- 'game' / 'comic' / 'image' kinds via the application path before
-- this migration was re-applied against a fresh DB snapshot, and the
-- constraint addition failed with "violated by some row". The CHECK
-- statements have been removed here; validation is enforced at the
-- API boundary via Zod parsing against `MEDIA_KINDS` from
-- `@shared/media-kinds.ts` (single source of truth). Migration 0104
-- drops the constraints originally added by 0100/0101/0102 to
-- eliminate the same drift class permanently.

ALTER TABLE "studio_projects"
  ADD COLUMN IF NOT EXISTS "media_kind" varchar(16) DEFAULT 'video' NOT NULL;

-- Filtered listings ("show me my podcast projects") will be a common
-- query path for the upcoming per-kind landing surfaces; partial index
-- on non-default values keeps the working set tiny.
CREATE INDEX IF NOT EXISTS "idx_studio_projects_media_kind"
  ON "studio_projects" ("media_kind")
  WHERE "media_kind" <> 'video';
