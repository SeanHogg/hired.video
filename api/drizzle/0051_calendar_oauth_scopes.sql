-- Migration: align `calendar_connections` with the shared
-- `oauthConnectionColumns` helper.
--
-- Adds the `scopes` column that LinkedIn / YouTube already carry, so all
-- three OAuth-style tables share the same lifecycle shape (refresh token,
-- expiry, scopes, soft-delete flag, timestamps). `access_token` stays
-- nullable here because some calendar flows authenticate via API-key
-- rather than full OAuth.
--
-- Wrapped in a DO block because not every environment has the
-- `calendar_connections` table yet — production was running without it
-- prior to the calendar feature rollout. Without the guard the runner
-- errors on environments where the table is absent. With it, the
-- migration is a no-op there and a column-add where the table exists.
-- `ADD COLUMN IF NOT EXISTS` keeps it idempotent on partially-migrated
-- environments.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = 'calendar_connections'
  ) THEN
    ALTER TABLE calendar_connections
      ADD COLUMN IF NOT EXISTS scopes TEXT;
  END IF;
END $$;
