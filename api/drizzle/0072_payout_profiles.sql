-- Migration: Payout Profiles — user-level tax / payout entity captured in
-- Settings → Payouts. Sits above creator_profiles because taxes follow the
-- person, not a per-enrollment row: cancelling the Creator Program and
-- re-enrolling must not require re-filing a W-9 / W-8.
--
-- One row per user (UNIQUE on user_id). The existing payout_* columns on
-- creator_profiles are now redundant; they remain in the schema for now and
-- are scheduled for removal once consumer code switches over (see Gap
-- Register entry on payout-column migration).
--
-- Tax ID storage: only the last 4 digits are stored in the clear
-- (`tax_id_last4`) for UI display. The full value lands in
-- `tax_id_encrypted` and MUST be encrypted at rest before any production
-- payout integration ships. This migration creates the column as plain text
-- as a placeholder; the encryption layer (KMS + AES-GCM, or Stripe Connect
-- TIN handoff) is tracked as a Gap Register item.

CREATE TABLE IF NOT EXISTS payout_profiles (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID         NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,

  -- Entity classification
  entity_type              VARCHAR(16),                            -- 'individual' | 'business'
  legal_name               VARCHAR(255),                           -- person's full legal name OR business legal name fallback
  business_legal_name      VARCHAR(255),                           -- only when entity_type='business'

  -- Tax residency + ID
  tax_residency_country    VARCHAR(2),                             -- ISO 3166-1 alpha-2; drives W-9 vs W-8 routing
  tax_id_type              VARCHAR(16),                            -- 'ssn' | 'ein' | 'itin' | 'foreign_tin'
  tax_id_last4             VARCHAR(4),                             -- last 4 digits, displayed in UI
  tax_id_encrypted         TEXT,                                   -- TODO encryption-at-rest before going live (Gap Register)
  tax_form_type            VARCHAR(16),                            -- 'w9' | 'w8ben' | 'w8bene'
  tax_form_submitted_at    TIMESTAMPTZ,
  tax_form_document_ref    TEXT,                                   -- Dropbox Sign envelope id / Stripe Connect tax doc id (TODO)

  -- 1099 / mailing address
  address_line1            VARCHAR(255),
  address_line2            VARCHAR(255),
  address_city             VARCHAR(120),
  address_region           VARCHAR(120),                           -- state / province
  address_postal_code      VARCHAR(20),
  address_country          VARCHAR(2),

  -- Payout rail
  payout_provider          VARCHAR(32),                            -- 'stripe' | 'helcim' | 'manual'
  payout_account_id        TEXT,
  payout_onboarded_at      TIMESTAMPTZ,
  payout_country           VARCHAR(2),
  payout_currency          VARCHAR(10)  NOT NULL DEFAULT 'USD',

  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payout_profiles_user
  ON payout_profiles (user_id);

CREATE INDEX IF NOT EXISTS idx_payout_profiles_payout_provider
  ON payout_profiles (payout_provider)
  WHERE payout_provider IS NOT NULL;
