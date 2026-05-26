-- Migration 0136 — Workforce Phase 3 follow-ups (#1439 + #1441).
--
-- Adds the multi-tenant recipient axis to invoices (so an agency
-- invoice has both the user who owns it AND the client *company*
-- being billed) and back-references the source timesheet for
-- idempotency. Also lands the per-employer integrations table that
-- #1441 needs as a credential store for QBO/Xero/Gusto/DocuSign.

-- ---------------------------------------------------------------------------
-- #1439 — invoices recipient-company axis + source-timesheet back-ref
-- ---------------------------------------------------------------------------

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS recipient_company_id UUID,
  ADD COLUMN IF NOT EXISTS source_timesheet_id UUID;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_recipient_company_fk'
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_recipient_company_fk
      FOREIGN KEY (recipient_company_id) REFERENCES company_profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_source_timesheet_fk'
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_source_timesheet_fk
      FOREIGN KEY (source_timesheet_id) REFERENCES timesheets(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Make the cycle locator (source_timesheet_id) unique so a re-approve
-- can't accidentally create a second invoice for the same week. NULL
-- timesheet refs are allowed multiple times (those are non-workforce
-- subscription invoices).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoices_source_timesheet
  ON invoices (source_timesheet_id)
  WHERE source_timesheet_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_recipient_company_status
  ON invoices (recipient_company_id, status)
  WHERE recipient_company_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- #1441 — company_integrations (OAuth credential store per provider)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS company_integrations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL REFERENCES company_profiles(id) ON DELETE CASCADE,
  -- quickbooks | xero | gusto | docusign | helcim | other
  provider             VARCHAR(32) NOT NULL,
  -- connected | disconnected | error
  status               VARCHAR(16) NOT NULL DEFAULT 'connected',
  -- Encrypted via services/payout/encryption.ts — same AES-GCM helper
  -- used for payout-profile bank tokens.
  access_token_enc     TEXT,
  refresh_token_enc    TEXT,
  expires_at           TIMESTAMPTZ,
  scopes               JSONB,
  -- Provider's own org / realm / company identifier.
  external_account_id  VARCHAR(255),
  connected_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  last_sync_at         TIMESTAMPTZ,
  last_error           TEXT,
  metadata             JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_company_integrations_company_provider
  ON company_integrations (company_id, provider);
CREATE INDEX IF NOT EXISTS idx_company_integrations_status
  ON company_integrations (status);
