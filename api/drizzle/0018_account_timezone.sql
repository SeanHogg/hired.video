-- Migration: 0018_account_timezone
-- Adds a `timezone` column to `account_preferences` so the Appearance tab's
-- Timezone picker can actually persist. Before this, the PUT /api/Settings/
-- account handler dropped `body.timezone` on the floor and GET hardcoded the
-- response to "UTC" — picking a timezone appeared to save but never stuck.
--
-- Stored as an IANA timezone name (e.g. "America/Los_Angeles"). The frontend
-- uses this via lib/hooks/use-user-timezone.ts to format dates in the user's
-- local zone instead of the browser's.

ALTER TABLE "account_preferences"
  ADD COLUMN IF NOT EXISTS "timezone" varchar(100) NOT NULL DEFAULT 'UTC';
