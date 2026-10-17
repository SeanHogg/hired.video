-- @owner-gated
-- 0578_clear_plaintext_ats_webhook_secret.sql
--
-- Step 3 of the ats_connections.webhook_secret encryption rollout started in
-- 0577 (sibling of 0549_clear_plaintext_credentials.sql).
--
-- Clears the legacy plaintext webhook secret. Approve (add this filename to
-- the SQL_MIGRATIONS_APPROVED repo variable) ONLY after:
--   * CREDENTIALS_KMS_KEY is set on the Worker, and
--   * `node --import tsx scripts/backfill-credential-encryption.ts` has run
--     against production and reported 0 remaining plaintext rows.
-- Any row still plaintext-only at that point loses its secret; inbound
-- webhooks for that connection are then accepted unsigned until the company
-- re-saves its ATS connection with the secret.

UPDATE ats_connections SET webhook_secret = NULL WHERE webhook_secret IS NOT NULL;
