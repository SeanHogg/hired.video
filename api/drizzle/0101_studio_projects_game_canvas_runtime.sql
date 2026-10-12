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
-- Two changes in this migration:
--   1. `studio_projects.game_state` — new JSONB column holding
--      `GameState` per `shared/game-state.ts`. Null for non-game
--      projects (every existing row).
--   2. `studio_projects.comic_state` — staged JSONB column for the
--      interactive-comic canvas runtime (#929). Schema landed alongside
--      game so a single migration carries both. Null for every non-comic
--      project.
--
-- HISTORICAL NOTE (2026-05-23, gap #963 follow-on): this migration
-- originally also drop+re-added the `studio_projects.media_kind` CHECK
-- constraint with the 6-kind set ('video' | 'podcast' | 'voice' |
-- 'animation' | 'game' | 'comic') and a mirror change on
-- `studio_templates`. Same drift class as 0099: production gained
-- 'image' kind rows via the application path before this migration
-- was re-applied against a fresh DB snapshot, and the 6-kind constraint
-- addition failed with "violated by some row" on `studio_projects`.
-- The CHECK statements have been removed from this file; the constraint
-- is first introduced (for both tables) by migration 0102 with the
-- broader 7-kind set, which accepts every existing row. See 0099's
-- header comment + #963 for the full pattern + the long-term CI-gate
-- proposal (#962) that would catch this drift before deploy.
--
-- No data backfill needed — every existing row is mediaKind='video' (or
-- a Phase 2+ kind that already uses `timeline_spec' / its own state
-- column); they all keep `game_state` + `comic_state` null.

-- ─── studio_projects ──────────────────────────────────────────────────────

ALTER TABLE "studio_projects"
  ADD COLUMN IF NOT EXISTS "game_state" jsonb;

ALTER TABLE "studio_projects"
  ADD COLUMN IF NOT EXISTS "comic_state" jsonb;
