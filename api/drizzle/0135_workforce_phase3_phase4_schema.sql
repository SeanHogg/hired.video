-- Migration 0135 — Workforce / agency back-office Phase 3+4 schema.
--
-- Closes the schema half of #1349 Phase 3 (placement back-office fields)
-- and Phase 4 (compliance doc vault). The actual derivation logic
-- (timesheet → invoice line item, timesheet → payout ledger,
-- QBO/Xero/Gusto adapter push) ships separately under #1410.
-- The doc-vault UI + e-sign integration ships separately under #1411.

-- ---------------------------------------------------------------------------
-- Phase 3 — placements back-office extension
-- ---------------------------------------------------------------------------

ALTER TABLE placements
  ADD COLUMN IF NOT EXISTS placement_kind     VARCHAR(32),
  ADD COLUMN IF NOT EXISTS end_date           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bill_rate_hourly   NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS pay_rate_hourly    NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS currency           VARCHAR(8) DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS burden_pct         NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS po_number          VARCHAR(100),
  ADD COLUMN IF NOT EXISTS msa_ref            VARCHAR(100),
  ADD COLUMN IF NOT EXISTS parent_placement_id UUID,
  ADD COLUMN IF NOT EXISTS timesheet_required BOOLEAN;

CREATE INDEX IF NOT EXISTS idx_placements_parent
  ON placements (parent_placement_id)
  WHERE parent_placement_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_placements_kind_status
  ON placements (placement_kind, status);

-- Self-FK for the extension chain. Cascade SET NULL so deleting a parent
-- doesn't cascade-delete child placements (they have their own history).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'placements_parent_fk'
  ) THEN
    ALTER TABLE placements
      ADD CONSTRAINT placements_parent_fk
      FOREIGN KEY (parent_placement_id) REFERENCES placements(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Phase 4 — placement_documents (compliance doc vault)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS placement_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id  UUID,
  company_id    UUID REFERENCES company_profiles(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  kind          VARCHAR(32) NOT NULL,
  file_path     TEXT,
  provider_name VARCHAR(32),
  provider_ref  VARCHAR(200),
  signed_at     TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  status        VARCHAR(16) NOT NULL DEFAULT 'pending',
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'placement_documents_placement_fk'
  ) THEN
    ALTER TABLE placement_documents
      ADD CONSTRAINT placement_documents_placement_fk
      FOREIGN KEY (placement_id) REFERENCES placements(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_placement_docs_placement
  ON placement_documents (placement_id);
CREATE INDEX IF NOT EXISTS idx_placement_docs_company_user
  ON placement_documents (company_id, user_id);
CREATE INDEX IF NOT EXISTS idx_placement_docs_expiry
  ON placement_documents (expires_at)
  WHERE expires_at IS NOT NULL;
