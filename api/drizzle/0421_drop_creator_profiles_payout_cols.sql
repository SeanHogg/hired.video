-- Migration 0421 — drop deprecated creator_profiles.payout_* columns (#313, TK7).
--
-- Payout + tax data moved to the per-user `payout_profiles` table (migration
-- 0092). The Drizzle `creatorProfiles` schema no longer declares these columns,
-- the `POST /api/creators/me/payout` route that wrote them was deleted, and a
-- repo-wide grep confirms zero remaining reads (code reads payout state via
-- `payout_profiles` JOINed on user_id). The columns from migration 0009 are now
-- dead weight on the table.
--
-- Idempotent per drizzle/TEMPLATE.md (rule 4: DROP COLUMN uses IF EXISTS).

ALTER TABLE creator_profiles DROP COLUMN IF EXISTS payout_provider;
ALTER TABLE creator_profiles DROP COLUMN IF EXISTS payout_account_id;
ALTER TABLE creator_profiles DROP COLUMN IF EXISTS payout_onboarded_at;
ALTER TABLE creator_profiles DROP COLUMN IF EXISTS payout_country;
ALTER TABLE creator_profiles DROP COLUMN IF EXISTS payout_currency;
