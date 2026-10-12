-- Migration 0169 — Confidential search mode for the Senior/Executive
-- audience (#1627, capability 1).
--
-- ~70% of senior execs are still employed and can't be seen publicly
-- job-hunting. `confidential_mode` is a fail-closed flag: when true, the
-- profile is EXCLUDED from the anonymous public people-search surface
-- entirely (the search WHERE adds `confidential_mode IS NOT TRUE`).
--
-- This pass ships the core (flag + public-search exclusion + settings
-- toggle). The employer-specific blocklist (visible to most recruiters
-- but hidden from named current-employer / competitor companies, which
-- needs the viewer's company resolved at query time) is the deeper half,
-- tracked separately.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.

ALTER TABLE "user_profiles"
  ADD COLUMN IF NOT EXISTS "confidential_mode" boolean NOT NULL DEFAULT false;

-- Partial index — the public people-search filters on
-- `confidential_mode IS NOT TRUE`; index only the rare confidential rows
-- so the planner can skip them cheaply on the hot path.
CREATE INDEX IF NOT EXISTS "user_profiles_confidential_mode_idx"
  ON "user_profiles" ("confidential_mode")
  WHERE "confidential_mode" = true;
