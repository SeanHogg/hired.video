-- 0577_ats_webhook_secret_enc.sql
--
-- Credential encryption rollout (0548/0549), extended to the last plaintext
-- credential: ats_connections.webhook_secret (the inbound-webhook HMAC
-- secret). Gets an encrypted sibling written through
-- api/src/services/crypto/credential-columns.ts (sealCredential /
-- openCredential, key CREDENTIALS_KMS_KEY). routes/ats.ts writes both halves
-- and the webhook verifier prefers the _enc column.
--
-- Rollout:
--   1. this migration (additive, nullable column);
--   2. scripts/backfill-credential-encryption.ts (now includes this column)
--      encrypts every remaining plaintext value and NULLs the plaintext;
--   3. 0578 (owner-gated) clears any plaintext still left.

ALTER TABLE ats_connections ADD COLUMN IF NOT EXISTS webhook_secret_enc text;
