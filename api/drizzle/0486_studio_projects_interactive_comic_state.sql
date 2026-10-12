-- Migration 0486 — `interactive_comic_state` runtime column (#1960 / #2126).
--
-- Comic+ (`mediaKind = 'interactive_comic'`) carries TWO persisted halves: the
-- per-page CanvasState (authored on the Timeline shell, stored via the existing
-- timeline path) AND a branching CHOICE GRAPH. The graph had nowhere to live —
-- `saveDraft` dropped it and the editor re-seeded a blank one on every open, so
-- a starter branch graph from a Comic+ template never survived create
-- (#2126), and the dedicated `InteractiveComicStage` graph editor had no
-- column to persist into (#1960).
--
-- This adds `studio_projects.interactive_comic_state` JSONB — the
-- `InteractiveComicState` shape (pages + startPageId + per-page choice
-- branches) in shared/interactive-comic-state.ts. Mirrors the parallel
-- per-runtime state-column pattern (game_state / image_state / cad_state /
-- cad_3d_state / document_state). Null for every non-interactive-comic project.
--
-- The `interactive_comic` media_kind value is already permitted by the CHECK
-- constraint (added in migration 0197) and the column is already varchar(24)
-- wide, so no constraint/type work is needed here.
--
-- No data backfill — existing rows stay their current kind and the column
-- stays null. Idempotent per drizzle/TEMPLATE.md (ADD COLUMN IF NOT EXISTS).

ALTER TABLE "studio_projects"
  ADD COLUMN IF NOT EXISTS "interactive_comic_state" jsonb;
