-- 0549_clear_plaintext_credentials.sql
--
-- SUPERSEDED (no-op). This was the owner-gated step that cleared the legacy
-- plaintext credential columns written by 0548. It was never approved, and
-- W3-C then merged ats_connections, calendar_connections, lms_connectors,
-- oauth_accounts and youtube_accounts into provider_connections (0600) and
-- archived the old tables (0601).
--
-- Running the old UPDATEs here would be wrong: migrations apply in filename
-- order, so 0549 would clear plaintext tokens BEFORE 0600 copies them into
-- provider_connections, and every affected user would have to reconnect.
-- The plaintext clear now lives in the owner-gated
-- 0602_clear_legacy_plaintext_connection_secrets.sql.

SELECT 1;
