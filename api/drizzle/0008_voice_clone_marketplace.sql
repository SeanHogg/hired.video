-- Voice Clone Marketplace Migration
--
-- Reshapes studio_voice_clones from an ElevenLabs-backed table into a
-- creator-owned, optionally-monetised asset that lives in the homepage media
-- catalog. Adds studio_voice_clone_licenses for grant tracking.
--
-- Synthesis is fully client-side via WebGPU TTS engines (Kokoro, Piper,
-- VibeVoice) — no model runs on the server. The backend stores the reference
-- audio sample, the creator's listing metadata, and the license ledger.

-- ── studio_voice_clones: drop dead ElevenLabs column, add marketplace fields ──
ALTER TABLE studio_voice_clones DROP COLUMN IF EXISTS external_voice_id;

ALTER TABLE studio_voice_clones ALTER COLUMN provider SET DEFAULT 'vibevoice';
ALTER TABLE studio_voice_clones ALTER COLUMN status   SET DEFAULT 'ready';

ALTER TABLE studio_voice_clones ADD COLUMN IF NOT EXISTS description       TEXT;
ALTER TABLE studio_voice_clones ADD COLUMN IF NOT EXISTS preview_audio_url TEXT;
ALTER TABLE studio_voice_clones ADD COLUMN IF NOT EXISTS preview_audio_key TEXT;

ALTER TABLE studio_voice_clones ADD COLUMN IF NOT EXISTS visibility       TEXT    NOT NULL DEFAULT 'private';
ALTER TABLE studio_voice_clones ADD COLUMN IF NOT EXISTS listing_slug     TEXT;
ALTER TABLE studio_voice_clones ADD COLUMN IF NOT EXISTS price_cents      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE studio_voice_clones ADD COLUMN IF NOT EXISTS currency         TEXT    NOT NULL DEFAULT 'USD';
ALTER TABLE studio_voice_clones ADD COLUMN IF NOT EXISTS platform_fee_bps INTEGER NOT NULL DEFAULT 2000;

ALTER TABLE studio_voice_clones ADD COLUMN IF NOT EXISTS language TEXT;
ALTER TABLE studio_voice_clones ADD COLUMN IF NOT EXISTS gender   TEXT;
ALTER TABLE studio_voice_clones ADD COLUMN IF NOT EXISTS accent   TEXT;

ALTER TABLE studio_voice_clones ADD COLUMN IF NOT EXISTS consent_agreed_at TIMESTAMPTZ;
ALTER TABLE studio_voice_clones ADD COLUMN IF NOT EXISTS consent_ip        TEXT;
ALTER TABLE studio_voice_clones ADD COLUMN IF NOT EXISTS consent_ua        TEXT;

ALTER TABLE studio_voice_clones ADD COLUMN IF NOT EXISTS play_count     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE studio_voice_clones ADD COLUMN IF NOT EXISTS purchase_count INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE studio_voice_clones ADD CONSTRAINT studio_voice_clones_listing_slug_key UNIQUE (listing_slug);
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table  THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_studio_voice_clones_visibility ON studio_voice_clones(visibility);
CREATE INDEX IF NOT EXISTS idx_studio_voice_clones_slug       ON studio_voice_clones(listing_slug);

-- Backfill: any existing rows are private (default), and any voiceovers
-- still defaulting to provider='elevenlabs' get retagged so future inserts
-- pick a real engine. Existing provider values are left untouched for audit.
ALTER TABLE studio_voiceovers ALTER COLUMN provider SET DEFAULT 'vibevoice';

-- ── studio_voice_clone_licenses: usage grants ────────────────────────────────
CREATE TABLE IF NOT EXISTS studio_voice_clone_licenses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             TEXT NOT NULL,
  voice_clone_id      UUID NOT NULL,
  source              TEXT NOT NULL,                       -- 'owner' | 'free' | 'purchase'
  price_paid_cents    INTEGER NOT NULL DEFAULT 0,
  creator_cut_cents   INTEGER NOT NULL DEFAULT 0,
  platform_cut_cents  INTEGER NOT NULL DEFAULT 0,
  payment_ref         TEXT,
  granted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_voice_clone_licenses_user  ON studio_voice_clone_licenses(user_id);
CREATE INDEX IF NOT EXISTS idx_studio_voice_clone_licenses_clone ON studio_voice_clone_licenses(voice_clone_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_studio_voice_clone_licenses_pair
  ON studio_voice_clone_licenses(user_id, voice_clone_id);

-- Owner-licenses for any pre-existing clones so creators don't lose access
-- to their own voices when the license gate goes live.
INSERT INTO studio_voice_clone_licenses (user_id, voice_clone_id, source)
SELECT user_id, id, 'owner'
FROM studio_voice_clones
ON CONFLICT DO NOTHING;
