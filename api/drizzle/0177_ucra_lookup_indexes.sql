-- Perf (gap #1679 follow-through): user_company_role_associations had NO
-- indexes, but the AI token-pool routing (resolveEmployeeAiContext) now reads
-- it on every AI call (gate + debit), and seat/workforce/invite paths read it
-- by (user_id) and (company_id) constantly. Add covering composites so those
-- are index scans, not seq scans. Idempotent per TEMPLATE.md.

-- Hot path: resolveEmployeeAiContext (user_id, role='employee', is_active) +
-- removeAccountUser + employerCompanyIds all filter by user_id (+ role/active).
CREATE INDEX IF NOT EXISTS idx_ucra_user_role_active
  ON user_company_role_associations (user_id, role, is_active);

-- getSeatCommitment / getCompanyTokenPoolView / recalculateWorkforceSeats /
-- assertCanManageInvitation all filter by company_id (+ role/active).
CREATE INDEX IF NOT EXISTS idx_ucra_company_role_active
  ON user_company_role_associations (company_id, role, is_active);
