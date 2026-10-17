-- Migration 0541 — age-axis indexes for the new retention policies (W1-B).
--
-- services/maintenance/retention-sweep.ts deletes expired rows in bounded
-- ctid batches ordered by the policy's age column; every single-column
-- policy needs an index LEADING with that column so the batch is an index
-- range scan rather than a full-table sort. The tables below gained a
-- policy in this pass and had no such index:
--
--   usage_events               occurred_at  (95 days — the longest traffic window is 90)
--   job_view_events            created_at   (180 days — readers window 30 days)
--   company_view_events        created_at   (180 days — readers window 30 days)
--   login_events               created_at   (180 days)
--   two_factor_codes           expires_at   (1 day past expiry)
--   magic_link_tokens          expires_at   (1 day past expiry)
--   email_verification_tokens  expires_at   (1 day past expiry)
--   password_reset_tokens      expires_at   (1 day past expiry)
--
-- (usage_sessions.last_seen and bot_block_events.created_at already have one.)
--
-- Additive only, no data change. Idempotent: IF NOT EXISTS throughout.
-- Every index is declared in its db/schema/*.ts table with the same name
-- (CI `drizzle-kit push --force` drops undeclared indexes).

CREATE INDEX IF NOT EXISTS idx_usage_events_occurred ON usage_events (occurred_at);
CREATE INDEX IF NOT EXISTS idx_job_view_events_created ON job_view_events (created_at);
CREATE INDEX IF NOT EXISTS idx_company_view_events_created ON company_view_events (created_at);
CREATE INDEX IF NOT EXISTS idx_login_events_created ON login_events (created_at);
CREATE INDEX IF NOT EXISTS idx_two_factor_codes_expires ON two_factor_codes (expires_at);
CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_expires ON magic_link_tokens (expires_at);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expires ON email_verification_tokens (expires_at);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON password_reset_tokens (expires_at);
