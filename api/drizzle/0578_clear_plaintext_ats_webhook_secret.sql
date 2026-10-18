-- 0578_clear_plaintext_ats_webhook_secret.sql
--
-- SUPERSEDED (no-op). This was the owner-gated step that cleared
-- ats_connections.webhook_secret after 0577 added webhook_secret_enc. It was
-- never approved, and W3-C then merged ats_connections into
-- provider_connections (0600, where the secret is extra_secret_enc) and
-- archived the old table (0601).
--
-- Running the old UPDATE here would clear the secret BEFORE 0600 copies it
-- (filename order), leaving ATS webhooks unsigned until the company re-saves.
-- The plaintext clear now lives in the owner-gated
-- 0602_clear_legacy_plaintext_connection_secrets.sql.

SELECT 1;
