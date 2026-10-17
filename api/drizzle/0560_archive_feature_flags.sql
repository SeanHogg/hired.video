-- Migration 0560: archive the vestigial feature_flags table.
--
-- The rollout-flag system (routes/featureflag.ts + the frontend
-- feature-flag service) had no real consumers: no UI read a flag, and the
-- only rows were the route's own inline seeds. The route, its mounts and the
-- Drizzle declaration are removed in the same change. Role/feature gating
-- lives in the role-access manifest (RoleAccessService), which is unrelated.
--
-- The table is moved, not dropped, so its rows stay recoverable. drizzle-kit
-- push only manages tables the schema declares (drizzle.config.ts
-- tablesFilter), so removing the declaration does not drop it first.
--
-- Idempotent: IF NOT EXISTS / IF EXISTS — a re-run (table already moved) is
-- a no-op. No BEGIN/COMMIT — the runner applies statement by statement.

CREATE SCHEMA IF NOT EXISTS archive;

ALTER TABLE IF EXISTS public.feature_flags SET SCHEMA archive;
