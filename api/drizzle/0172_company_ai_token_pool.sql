-- Gap #1679 — AI token account pool + per-member sub-cap. Active workforce
-- employees draw AI tokens from their employer's shared pool (seats × the
-- monthly per-seat allowance) instead of a personal allowance, with an
-- optional per-member ceiling. Idempotent per TEMPLATE.md.

-- 1. Attribute each AI usage row to a workspace when billed against a pool.
ALTER TABLE ai_usage_records
  ADD COLUMN IF NOT EXISTS company_id uuid;

-- FK to company_profiles (nullable; NULL = personal/per-user consumption).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_usage_records_company_id_fkey') THEN
    ALTER TABLE ai_usage_records ADD CONSTRAINT ai_usage_records_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES company_profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Company pool monthly total + per-member sub-cap reads filter on
-- (company_id, user_id, created_at).
CREATE INDEX IF NOT EXISTS idx_ai_usage_records_company
  ON ai_usage_records (company_id, user_id, created_at);

-- 2. Per-member AI-token sub-cap inside the pool.
ALTER TABLE user_company_role_associations
  ADD COLUMN IF NOT EXISTS monthly_token_limit integer;

-- 3. Per-company purchased token pool (overflow once the seat-derived monthly
--    allowance is spent). Mirrors user_token_balance.
CREATE TABLE IF NOT EXISTS company_token_balance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE,
  balance integer NOT NULL DEFAULT 0,
  lifetime_granted integer NOT NULL DEFAULT 0,
  lifetime_consumed integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_token_balance_company_id_fkey') THEN
    ALTER TABLE company_token_balance ADD CONSTRAINT company_token_balance_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES company_profiles(id) ON DELETE CASCADE;
  END IF;
END $$;
