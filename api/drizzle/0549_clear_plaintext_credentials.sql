-- @owner-gated
-- 0549_clear_plaintext_credentials.sql
--
-- W1-D data-model hygiene (architecture remediation 2026-10-17), step 3 of
-- the credential encryption rollout started in 0548.
--
-- Clears every legacy plaintext credential column. Approve (add this filename
-- to the SQL_MIGRATIONS_APPROVED repo variable) ONLY after:
--   * CREDENTIALS_KMS_KEY is set on the Worker, and
--   * `node --import tsx scripts/backfill-credential-encryption.ts` has run
--     against production and reported 0 remaining plaintext rows.
-- Any row still plaintext-only at that point loses its token and the user
-- must reconnect that integration.
--
-- The plaintext columns themselves are dropped in a later migration once no
-- code reads them (credential-columns.ts openCredential fallback removed).

UPDATE ats_connections      SET api_key = NULL       WHERE api_key IS NOT NULL;
UPDATE calendar_connections SET access_token = NULL  WHERE access_token IS NOT NULL;
UPDATE calendar_connections SET refresh_token = NULL WHERE refresh_token IS NOT NULL;
UPDATE lms_connectors       SET access_token = NULL  WHERE access_token IS NOT NULL;
UPDATE lms_connectors       SET refresh_token = NULL WHERE refresh_token IS NOT NULL;
UPDATE oauth_accounts       SET access_token = NULL  WHERE access_token IS NOT NULL;
UPDATE oauth_accounts       SET refresh_token = NULL WHERE refresh_token IS NOT NULL;
UPDATE youtube_accounts     SET access_token = NULL  WHERE access_token IS NOT NULL;
UPDATE youtube_accounts     SET refresh_token = NULL WHERE refresh_token IS NOT NULL;
