-- Migration 0133 — Workforce / agency back-office Phase 0.
--
-- Closes gap-register #1349 Phase 0 + the partial state of #1405:
-- adds the missing `company_id` column to `account_invitations` so an
-- employer-driven invite (role=employee) carries enough context for the
-- accept handler to create a `user_company_role_associations` row,
-- scoping the new member to that employer's workspace.
--
-- Nullable on purpose — legacy platform-role invites (recruiter / employer
-- joining the platform, not bound to a specific company) keep working
-- without a value.

ALTER TABLE account_invitations
  ADD COLUMN IF NOT EXISTS company_id UUID;

-- Backfill: nothing to do. Existing rows are all pre-workforce platform
-- invites with no company binding by design.

-- Index for the accept handler lookup path that needs to filter pending
-- invites by company (employer reviewing who they've invited).
CREATE INDEX IF NOT EXISTS idx_account_invitations_company_status
  ON account_invitations (company_id, status)
  WHERE company_id IS NOT NULL;
