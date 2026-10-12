-- Gap #1680 — account_invitations had no expiry column, so the 14-day
-- expiry shown in the Team Members UI was cosmetic and never enforced on
-- accept (gap #1674). Add a real `expires_at` and backfill pending rows
-- from their created_at so existing invites get a deterministic deadline.
-- Idempotent per TEMPLATE.md.

ALTER TABLE account_invitations
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Backfill: any row missing an expiry inherits created_at + 14 days, the
-- same window the UI already implied. New rows get their expiry set by the
-- invite service explicitly.
UPDATE account_invitations
SET expires_at = created_at + INTERVAL '14 days'
WHERE expires_at IS NULL;

-- The pending-invite list + accept lookups filter on status; index it so
-- the now-scoped queries (gap #1682) stay cheap.
CREATE INDEX IF NOT EXISTS idx_account_invitations_status
  ON account_invitations (status);

-- Accept resolves invites by their secret token; it is already UNIQUE, but
-- an explicit index documents the access path for future readers.
CREATE INDEX IF NOT EXISTS idx_account_invitations_company
  ON account_invitations (company_id);
