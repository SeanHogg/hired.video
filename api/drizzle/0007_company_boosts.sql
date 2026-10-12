-- Gap #107 — self-serve featured company profile boost

-- Add featured columns to company_profiles
ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS featured_until TIMESTAMPTZ;
ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS featured_rank_boost INTEGER NOT NULL DEFAULT 0;

-- New companyBoosts table mirroring jobBoosts
CREATE TABLE IF NOT EXISTS company_boosts (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               TEXT NOT NULL,
  user_id                  TEXT NOT NULL,
  placement_type           TEXT NOT NULL,
  pricing_model            TEXT NOT NULL,
  budget_cents             INTEGER NOT NULL,
  spent_cents              INTEGER NOT NULL DEFAULT 0,
  rate_unit_cents          INTEGER NOT NULL DEFAULT 500,
  status                   TEXT NOT NULL DEFAULT 'active',
  impressions              INTEGER NOT NULL DEFAULT 0,
  clicks                   INTEGER NOT NULL DEFAULT 0,
  follows                  INTEGER NOT NULL DEFAULT 0,
  stripe_payment_intent_id TEXT,
  starts_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at                  TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_company_boosts_company ON company_boosts(company_id);
CREATE INDEX IF NOT EXISTS idx_company_boosts_user ON company_boosts(user_id);
CREATE INDEX IF NOT EXISTS idx_company_boosts_status ON company_boosts(status);
