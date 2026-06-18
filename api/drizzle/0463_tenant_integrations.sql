-- 0463_tenant_integrations.sql
-- Generic self-serve API-key vendor integrations registry (#261).
--
-- One row per (user, company, provider, slug). The raw credential is NEVER
-- stored — only the AES-GCM ciphertext (+ tag), per-row nonce, key-version
-- label, and a non-secret last4 hint. Encryption is the same helper used for
-- payout-profile tax IDs (services/payout/encryption.ts).
--
-- Idempotent per TEMPLATE.md: CREATE TABLE / CREATE INDEX guarded with
-- IF NOT EXISTS. Two partial unique indexes handle the NULLable companyId
-- (Postgres treats NULL as distinct in a plain UNIQUE, which would let a
-- personal-scope duplicate slip through).

CREATE TABLE IF NOT EXISTS tenant_integrations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id              uuid REFERENCES company_profiles(id) ON DELETE CASCADE,
  provider                varchar(64) NOT NULL,
  slug                    varchar(64) NOT NULL,
  credentials_ciphertext  bytea NOT NULL,
  credentials_nonce       bytea NOT NULL,
  credentials_kms_key_id  text NOT NULL,
  credentials_last4       varchar(4),
  is_active               boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Company-scoped uniqueness (company_id set).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tenant_integrations_company_provider_slug
  ON tenant_integrations (user_id, company_id, provider, slug)
  WHERE company_id IS NOT NULL;

-- Personal-scoped uniqueness (company_id NULL) — NULLs aren't deduped by a
-- plain UNIQUE, so scope this partial index on the user + provider + slug.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tenant_integrations_personal_provider_slug
  ON tenant_integrations (user_id, provider, slug)
  WHERE company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_integrations_user
  ON tenant_integrations (user_id);

CREATE INDEX IF NOT EXISTS idx_tenant_integrations_company
  ON tenant_integrations (company_id);
