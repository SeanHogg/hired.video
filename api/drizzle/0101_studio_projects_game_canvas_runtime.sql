-- Migration 0101 — game + comic canvas runtime foundation.
--
-- Per Consolidated Gap Register #927 + #929 + the PRD §0 canvas-runtime
-- extensibility model: `mediaKind` is the first-class extensibility hook
-- that selects which canvas runtime mounts in the editor. The Timeline
-- runtime hosts every shipping kind today (video / podcast / voice /
-- animation); `game` is the first non-Timeline kind to land, with
-- `comic` staged alongside it. Each non-Timeline kind's state lives in a
-- separate JSONB column parallel to today's `timeline_spec`.
--
-- Three changes in this migration:
--   1. `studio_projects.media_kind` CHECK constraint — relaxed to
--      include 'game' + 'comic'. (Mirror change on `studio_templates`.)
--   2. `studio_projects.game_state` — new JSONB column holding
--      `GameState` per `shared/game-state.ts`. Null for non-game
--      projects (every existing row).
--   3. `studio_projects.comic_state` — staged JSONB column for the
--      interactive-comic canvas runtime (#929). Schema landed alongside
--      game so a single CHECK relax + a single migration carries both.
--      Null for every non-comic project.
--
-- No data backfill needed — every existing row is mediaKind='video' (or
-- a Phase 2+ kind that already uses `timeline_spec`); they all keep
-- `game_state` + `comic_state` null.

-- ─── studio_projects ──────────────────────────────────────────────────────

ALTER TABLE "studio_projects"
  DROP CONSTRAINT IF EXISTS "studio_projects_media_kind_check";
ALTER TABLE "studio_projects"
  ADD CONSTRAINT "studio_projects_media_kind_check"
  CHECK ("media_kind" IN ('video', 'podcast', 'voice', 'animation', 'game', 'comic'));

ALTER TABLE "studio_projects"
  ADD COLUMN IF NOT EXISTS "game_state" jsonb;

ALTER TABLE "studio_projects"
  ADD COLUMN IF NOT EXISTS "comic_state" jsonb;

-- ─── studio_templates ─────────────────────────────────────────────────────
--
-- Mirror the CHECK relax so a creator publishing a game / comic template
-- (#927 / #929 follow-on paths) doesn't blow up on the constraint. The
-- marketplace's `videoScript` JSONB column hosts the snapshot regardless
-- of kind; only the CHECK gates the kind label.

ALTER TABLE "studio_templates"
  DROP CONSTRAINT IF EXISTS "studio_templates_media_kind_check";
ALTER TABLE "studio_templates"
  ADD CONSTRAINT "studio_templates_media_kind_check"
  CHECK ("media_kind" IN ('video', 'podcast', 'voice', 'animation', 'game', 'comic'));
