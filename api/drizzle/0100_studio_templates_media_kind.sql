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
-- default 'video' NOT NULL + partial index on non-default values for
-- the upcoming per-kind chooser.
--
-- Backfill: every pre-#913 row gets media_kind = 'video' via the column
-- default, which is correct — every existing template was authored from
-- a video project.
--
-- HISTORICAL NOTE (2026-05-23, gap #963 follow-on): this migration
-- originally also added a `studio_templates.media_kind` CHECK constraint
-- hardcoding the 4 kinds known at authoring time. Same drift class as
-- 0099 / 0101: future kind additions ('game' / 'comic' / 'image') went
-- through the application path before the broader-set re-add migrations
-- ran from scratch, so the narrow constraint risks "violated by some
-- row" on any fresh DB seeded with production data. The CHECK statements
-- have been removed; the constraint is first introduced for
-- `studio_templates` by migration 0102 with the broader 7-kind set,
-- which accepts every existing row. Application-layer validation lives
-- at the Zod boundary (`z.enum(MEDIA_KINDS)` from
-- `@shared/media-kinds.ts`).

ALTER TABLE "studio_templates"
  ADD COLUMN IF NOT EXISTS "media_kind" varchar(16) DEFAULT 'video' NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_studio_templates_media_kind"
  ON "studio_templates" ("media_kind")
  WHERE "media_kind" <> 'video';
