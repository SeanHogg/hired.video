-- Migration 0106 — animation canvas runtime foundation.
--
-- Closes Consolidated Gap Register #1003 by adding the persistence
-- column for the AnimationState shape in shared/animation-state.ts.
-- Mirrors the pattern set by 0101 (game / comic) and 0102 (image):
-- each non-Timeline canvas runtime persists its own state in a
-- parallel JSONB column on `studio_projects`, with the runtime
-- selected at mount time by `<CanvasRouter mediaKind/>`.
--
-- Animation kind authors per-frame raster pixels; the column holds the
-- frame strip + canvas dimensions + fps + onion-skin depth + loop
-- count + background fill. Each frame carries a base64 PNG dataURL so
-- the project round-trips through JSONB without an out-of-band blob
-- store (same trade-off as 0102 / ImageState).
--
-- The media_kind CHECK constraint already includes 'animation' (per
-- 0102's 7-kind set) so no constraint surgery is needed here.
--
-- No data backfill — every existing row stays mediaKind=non-animation
-- and animation_state stays null.

ALTER TABLE "studio_projects"
  ADD COLUMN IF NOT EXISTS "animation_state" jsonb;
