-- Migration 0187 — company embedding enablement.
--
-- An employer can turn on embedding for their company (company_profiles
-- .embed_enabled) and mint company-scoped embed keys to authorize rendering
-- their hired.video surfaces (e.g. the People-Ops roster) on their own site.
-- Mirrors the user-scoped api_keys design (prefix + SHA-256 hash, full key
-- shown once) but scoped to a company and with an origin allowlist.
--
-- Idempotent per drizzle/TEMPLATE.md.

ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS embed_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS company_embed_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES company_profiles(id) ON DELETE CASCADE,
  label           VARCHAR(255) NOT NULL,
  -- First 12 chars ("hvk_" + 8 hex) for display; full key shown once at create.
  key_prefix      VARCHAR(16) NOT NULL,
  -- SHA-256 hex of the full key — validated server-side; never stored plaintext.
  key_hash        TEXT NOT NULL,
  -- What the key may render/read, e.g. ["people:roster","people:one-on-ones"].
  scopes          JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Origin allowlist for the embed (CORS / referer check). Empty = none allowed.
  allowed_origins JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  last_used_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_embed_keys_company
  ON company_embed_keys (company_id, is_active);
-- Validation path looks a key up by its hash.
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_embed_keys_hash
  ON company_embed_keys (key_hash);
