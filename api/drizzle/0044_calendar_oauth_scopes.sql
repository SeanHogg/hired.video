-- Migration: align `calendar_connections` with the shared
-- `oauthConnectionColumns` helper.
--
-- Adds the `scopes` column that LinkedIn / YouTube already carry, so all
-- three OAuth-style tables share the same lifecycle shape (refresh token,
-- expiry, scopes, soft-delete flag, timestamps). `access_token` stays
-- nullable here because some calendar flows authenticate via API-key
-- rather than full OAuth.
--
-- Idempotent — `IF NOT EXISTS` so re-running on a partially-migrated
-- environment is safe.

ALTER TABLE calendar_connections
  ADD COLUMN IF NOT EXISTS scopes TEXT;
