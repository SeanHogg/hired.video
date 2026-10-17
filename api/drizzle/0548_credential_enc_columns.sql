-- 0548_credential_enc_columns.sql
--
-- W1-D data-model hygiene (architecture remediation 2026-10-17).
--
-- Five tables stored third-party credentials in plaintext `text` columns.
-- Each gets an encrypted `*_enc` sibling written through
-- api/src/services/crypto/credential-columns.ts (AES-256-GCM, HKDF label
-- "hired.video/credentials/v1", key CREDENTIALS_KMS_KEY). Readers prefer the
-- `_enc` column and fall back to plaintext only for rows written before the
-- key was configured.
--
-- Rollout:
--   1. this migration (additive, nullable columns);
--   2. scripts/backfill-credential-encryption.ts encrypts every remaining
--      plaintext value into its `_enc` column and NULLs the plaintext;
--   3. 0549 (owner-gated) clears any plaintext still left.
--
-- youtube_accounts.access_token loses NOT NULL so an encrypted row can hold
-- NULL there.

ALTER TABLE ats_connections ADD COLUMN IF NOT EXISTS api_key_enc text;

ALTER TABLE calendar_connections ADD COLUMN IF NOT EXISTS access_token_enc text;
ALTER TABLE calendar_connections ADD COLUMN IF NOT EXISTS refresh_token_enc text;

ALTER TABLE lms_connectors ADD COLUMN IF NOT EXISTS access_token_enc text;
ALTER TABLE lms_connectors ADD COLUMN IF NOT EXISTS refresh_token_enc text;

ALTER TABLE oauth_accounts ADD COLUMN IF NOT EXISTS access_token_enc text;
ALTER TABLE oauth_accounts ADD COLUMN IF NOT EXISTS refresh_token_enc text;

ALTER TABLE youtube_accounts ADD COLUMN IF NOT EXISTS access_token_enc text;
ALTER TABLE youtube_accounts ADD COLUMN IF NOT EXISTS refresh_token_enc text;
ALTER TABLE youtube_accounts ALTER COLUMN access_token DROP NOT NULL;
