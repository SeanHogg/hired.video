-- Migration 0107 — CAD canvas runtime foundation.
--
-- Closes the persistence half of Consolidated Gap Register #930 by
-- adding the column for the `CadState` shape in shared/cad-state.ts.
-- Mirrors the pattern set by 0101 (game/comic), 0102 (image), and
-- 0106 (animation): each non-Timeline canvas runtime persists its own
-- state in a parallel JSONB column on `studio_projects`, selected at
-- mount time by `<CanvasRouter mediaKind/>`.
--
-- CAD is the first VECTOR runtime — entities are mathematical shapes
-- (lines, arcs, polylines, circles, dimensions, text) with absolute
-- coordinates in millimetres, not raster pixels or scene-based time
-- slices.
--
-- Two changes in this migration:
--   1. `studio_projects.media_kind` CHECK constraint — relaxed to
--      include 'cad'. (Mirror change on `studio_templates`.)
--   2. `studio_projects.cad_state` — new JSONB column holding the
--      `CadState` shape. Null for every non-cad project (every
--      existing row).
--
-- No data backfill — every existing row stays mediaKind=non-cad and
-- cad_state stays null.

-- ─── studio_projects ──────────────────────────────────────────────────────

ALTER TABLE "studio_projects"
  DROP CONSTRAINT IF EXISTS "studio_projects_media_kind_check";
ALTER TABLE "studio_projects"
  ADD CONSTRAINT "studio_projects_media_kind_check"
  CHECK ("media_kind" IN ('video', 'podcast', 'voice', 'animation', 'game', 'comic', 'image', 'cad'));

ALTER TABLE "studio_projects"
  ADD COLUMN IF NOT EXISTS "cad_state" jsonb;

-- ─── studio_templates ─────────────────────────────────────────────────────
-- Mirror the CHECK relax so a creator publishing a CAD template
-- doesn't blow up on the constraint.

ALTER TABLE "studio_templates"
  DROP CONSTRAINT IF EXISTS "studio_templates_media_kind_check";
ALTER TABLE "studio_templates"
  ADD CONSTRAINT "studio_templates_media_kind_check"
  CHECK ("media_kind" IN ('video', 'podcast', 'voice', 'animation', 'game', 'comic', 'image', 'cad'));
