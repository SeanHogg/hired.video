-- Migration 0102 — image canvas runtime foundation.
--
-- Per Consolidated Gap Register #932 + the canvas-runtime extensibility
-- model in PRD §1.2: `mediaKind: 'image'` mounts a Photoshop-shaped
-- raster editor as a first-class canvas kind alongside the Timeline
-- runtime (video/podcast/voice/animation), the Game runtime, and the
-- Comic runtime. Single-frame static authoring; no time axis.
--
-- Three changes in this migration, mirroring the pattern set by 0101
-- for game + comic:
--   1. `studio_projects.media_kind` CHECK constraint — relaxed to
--      include 'image'. (Mirror change on `studio_templates`.)
--   2. `studio_projects.image_state` — new JSONB column holding the
--      `ImageState` shape per `shared/image-state.ts`. Null for every
--      non-image project (every existing row).
--   3. The `studio_projects.kind` column stays at 'scene' for image
--      projects — the storage discriminator only distinguishes
--      Timeline vs NLE today; non-Timeline runtimes coexist with the
--      'scene' / 'nle' values without growing that enum (the runtime
--      is selected by mediaKind via the CanvasRouter, not by kind).
--
-- No data backfill — every existing row stays mediaKind=non-image and
-- image_state stays null.

-- ─── studio_projects ──────────────────────────────────────────────────────

ALTER TABLE "studio_projects"
  DROP CONSTRAINT IF EXISTS "studio_projects_media_kind_check";
ALTER TABLE "studio_projects"
  ADD CONSTRAINT "studio_projects_media_kind_check"
  CHECK ("media_kind" IN ('video', 'podcast', 'voice', 'animation', 'game', 'comic', 'image'));

ALTER TABLE "studio_projects"
  ADD COLUMN IF NOT EXISTS "image_state" jsonb;

-- ─── studio_templates ─────────────────────────────────────────────────────
--
-- Mirror the CHECK relax so a creator publishing an image template
-- (#932 marketplace follow-on) doesn't blow up on the constraint. The
-- marketplace's `videoScript` JSONB column hosts the snapshot regardless
-- of kind; only the CHECK gates the kind label.

ALTER TABLE "studio_templates"
  DROP CONSTRAINT IF EXISTS "studio_templates_media_kind_check";
ALTER TABLE "studio_templates"
  ADD CONSTRAINT "studio_templates_media_kind_check"
  CHECK ("media_kind" IN ('video', 'podcast', 'voice', 'animation', 'game', 'comic', 'image'));
