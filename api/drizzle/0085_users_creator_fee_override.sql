-- Migration 0085 — per-user creator platform-fee override (#157).
--
-- Nullable int4 on `users`. Null means "fall back to the platform-wide
-- default `PLATFORM_FEE_BPS_DEFAULT` constant"; a non-null value is the
-- override used at the next opt-in / publish event. Existing listings
-- keep their `platform_fee_bps` snapshot unchanged.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS creator_platform_fee_bps_override INTEGER;
