-- Studio Template Marketplace Migration
--
-- Adds creator-published, buyable studio video templates and a polymorphic
-- license ledger for template ownership (resume / job / studio).
--
-- Modeled on 0008_voice_clone_marketplace.sql — same publish gates (creator
-- enrollment + consent), same fee snapshot pattern (platform_fee_bps stored
-- per-listing), same source taxonomy on the licenses table
-- (owner / free / purchase).

-- ── studio_templates: sellable VideoScript snapshots ────────────────────────
CREATE TABLE IF NOT EXISTS studio_templates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_project_id   UUID,
  name                VARCHAR(200) NOT NULL,
  description         TEXT,
  thumbnail_url       TEXT,
  preview_video_url   TEXT,
  video_script        JSONB NOT NULL,
  duration_sec        INTEGER,
  motion              TEXT,
  language            TEXT,
  tags                JSONB NOT NULL DEFAULT '[]'::jsonb,
  visibility          TEXT NOT NULL DEFAULT 'private',
  listing_slug        TEXT,
  price_cents         INTEGER NOT NULL DEFAULT 0,
  currency            TEXT NOT NULL DEFAULT 'USD',
  platform_fee_bps    INTEGER NOT NULL DEFAULT 500,
  consent_agreed_at   TIMESTAMPTZ,
  consent_ip          TEXT,
  consent_ua          TEXT,
  view_count          INTEGER NOT NULL DEFAULT 0,
  purchase_count      INTEGER NOT NULL DEFAULT 0,
  published_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  ALTER TABLE studio_templates ADD CONSTRAINT studio_templates_listing_slug_key UNIQUE (listing_slug);
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table  THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_studio_templates_creator    ON studio_templates(creator_id);
CREATE INDEX IF NOT EXISTS idx_studio_templates_visibility ON studio_templates(visibility);
CREATE INDEX IF NOT EXISTS idx_studio_templates_slug       ON studio_templates(listing_slug);

-- ── template_licenses: polymorphic ownership ledger ─────────────────────────
-- Covers resume / job / studio template kinds with a single (kind, id) pair.
-- The unique grant index makes duplicate fulfilment calls idempotent.
CREATE TABLE IF NOT EXISTS template_licenses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_kind       TEXT NOT NULL,                    -- 'resume' | 'job' | 'studio'
  template_id         TEXT NOT NULL,
  source              TEXT NOT NULL,                    -- 'owner' | 'free' | 'purchase'
  price_paid_cents    INTEGER NOT NULL DEFAULT 0,
  creator_cut_cents   INTEGER NOT NULL DEFAULT 0,
  platform_cut_cents  INTEGER NOT NULL DEFAULT 0,
  payment_ref         TEXT,
  granted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_template_licenses_user     ON template_licenses(user_id);
CREATE INDEX IF NOT EXISTS idx_template_licenses_template ON template_licenses(template_kind, template_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_template_licenses_grant
  ON template_licenses(user_id, template_kind, template_id);
