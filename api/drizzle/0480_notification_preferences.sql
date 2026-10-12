-- Migration 0480 — granular notification preferences (TK10 integrations-comms, gap #254).
--
-- The Settings UI has long rendered a 12-toggle notification matrix
-- (email/push/sms × category), but the backend collapsed every toggle into
-- the four coarse `*_enabled` booleans on `account_preferences` and the
-- notification dispatcher never read any of them — so the toggles were a
-- facade and a user could not actually stop a push.
--
-- This adds a JSONB column holding the full granular matrix (shape =
-- shared/notification-preferences.ts → NotificationPreferences). The coarse
-- booleans remain as derived projections for legacy readers
-- (services/user/account.ts, etc.). NULL until the user first saves; readers
-- fall back to defaults via mergeNotificationPreferences().
--
-- Idempotent per drizzle/TEMPLATE.md.

ALTER TABLE account_preferences
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB;
