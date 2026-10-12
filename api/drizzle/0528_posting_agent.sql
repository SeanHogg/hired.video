-- Migration 0528: AI Posting Agent (#2300) — additive only
-- Adds source/caption_source on social_publish_jobs and posting_agent_settings.
-- The publications unique-constraint swap lives in 0529_publications_variant_unique.sql
-- (owner-gated) so this file can ship without the duplicate-audit.
--
-- Idempotent: IF NOT EXISTS / DROP IF EXISTS / pg_constraint guards.
-- Constraint and index names match api/src/db/schema/distribution.ts so
-- drizzle-kit push does not rewrite them.
-- No BEGIN/COMMIT — the runner applies statement by statement.

-- 1. Additive columns on social_publish_jobs
ALTER TABLE social_publish_jobs ADD COLUMN IF NOT EXISTS source varchar(8) NOT NULL DEFAULT 'user';
ALTER TABLE social_publish_jobs ADD COLUMN IF NOT EXISTS caption_source varchar(8);

DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_publish_jobs_source_check') THEN
    ALTER TABLE social_publish_jobs
      ADD CONSTRAINT social_publish_jobs_source_check CHECK (source IN ('user', 'agent'));
  END IF;
END $mig$;

DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_publish_jobs_caption_source_check') THEN
    ALTER TABLE social_publish_jobs
      ADD CONSTRAINT social_publish_jobs_caption_source_check
      CHECK (caption_source IS NULL OR caption_source IN ('ai', 'template'));
  END IF;
END $mig$;

-- 2. Widen status CHECK to draft + expired (schema name, not chk_*)
ALTER TABLE social_publish_jobs DROP CONSTRAINT IF EXISTS social_publish_jobs_status_check;
ALTER TABLE social_publish_jobs DROP CONSTRAINT IF EXISTS chk_social_publish_jobs_status;

DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_publish_jobs_status_check') THEN
    ALTER TABLE social_publish_jobs
      ADD CONSTRAINT social_publish_jobs_status_check
      CHECK (status IN ('scheduled', 'running', 'done', 'failed', 'cancelled', 'draft', 'expired'));
  END IF;
END $mig$;

-- 3. posting_agent_settings — types and names match the Drizzle schema
CREATE TABLE IF NOT EXISTS posting_agent_settings (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  mode varchar(8) NOT NULL DEFAULT 'approve',
  cadence varchar(8) NOT NULL DEFAULT 'steady',
  post_minute smallint NOT NULL DEFAULT 720,
  destinations varchar(16)[] NOT NULL DEFAULT ARRAY['feed']::varchar(16)[],
  quiet_start_minute smallint NOT NULL DEFAULT 1260,
  quiet_end_minute smallint NOT NULL DEFAULT 480,
  email_digest boolean NOT NULL DEFAULT true,
  next_plan_at timestamptz,
  paused_reason varchar(16),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'posting_agent_settings_mode_check') THEN
    ALTER TABLE posting_agent_settings
      ADD CONSTRAINT posting_agent_settings_mode_check CHECK (mode IN ('approve', 'auto'));
  END IF;
END $mig$;

DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'posting_agent_settings_cadence_check') THEN
    ALTER TABLE posting_agent_settings
      ADD CONSTRAINT posting_agent_settings_cadence_check CHECK (cadence IN ('light', 'steady', 'daily'));
  END IF;
END $mig$;

DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'posting_agent_settings_paused_reason_check') THEN
    ALTER TABLE posting_agent_settings
      ADD CONSTRAINT posting_agent_settings_paused_reason_check
      CHECK (paused_reason IN ('user', 'plan', 'admin'));
  END IF;
END $mig$;

DROP INDEX IF EXISTS idx_posting_agent_settings_due;
CREATE INDEX IF NOT EXISTS idx_posting_agent_settings_enabled_next_plan
  ON posting_agent_settings (enabled, next_plan_at) WHERE enabled = true;
