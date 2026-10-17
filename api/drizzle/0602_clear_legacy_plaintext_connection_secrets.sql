-- @owner-gated
-- 0602_clear_legacy_plaintext_connection_secrets.sql
--
-- W3-C provider connections — last step of the credential encryption rollout
-- (replaces 0549 / 0578, whose tables 0601 archived).
--
-- 0600 copied credentials that were still plaintext in their legacy table as
-- `legacy:plain:<value>`. Reads re-seal them under CREDENTIALS_KMS_KEY
-- (services/provider-connections/connection-secrets.ts) and
-- scripts/backfill-credential-encryption.ts re-seals every remaining legacy
-- value. Approve this file (add it to the SQL_MIGRATIONS_APPROVED repo
-- variable) ONLY after:
--   * CREDENTIALS_KMS_KEY is set on the Worker, and
--   * `node --import tsx scripts/backfill-credential-encryption.ts` has run
--     against production and reported 0 remaining legacy secrets.
-- Any value still plaintext at that point is cleared; that connection must be
-- reconnected (an ATS webhook secret cleared here means inbound webhooks are
-- accepted unsigned until the company re-saves its ATS connection).
--
-- Ciphertext of the other legacy schemes (paid_media, social, email,
-- workforce, payout) is NOT touched — it is still encrypted, and the backfill
-- script re-seals it once their old keys are available to it.

UPDATE provider_connections SET access_token_enc = NULL, updated_at = now()
 WHERE access_token_enc LIKE 'legacy:plain:%';
UPDATE provider_connections SET refresh_token_enc = NULL, updated_at = now()
 WHERE refresh_token_enc LIKE 'legacy:plain:%';
UPDATE provider_connections SET extra_secret_enc = NULL, updated_at = now()
 WHERE extra_secret_enc LIKE 'legacy:plain:%';
