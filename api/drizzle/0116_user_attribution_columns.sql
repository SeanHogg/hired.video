-- Migration 0116 — Inbound attribution columns on `users` (closes #1195).
--
-- Pre-campaign attribution audit (2026-05-25) found that:
--   * `App.tsx GTMPageTracker` captures `utm_source/medium/campaign/term/content`
--     into sessionStorage + the GTM dataLayer for GA/Meta pixel attribution, but
--   * `Signup.tsx` only ships `referralCode` to `POST /api/auth/register` and
--   * `users` has zero columns to persist the inbound campaign attribution.
--
-- Consequence: server-side LTV-by-campaign queries are impossible. Affiliate
-- credit is fixed in the same pass (#1194), but a referred user can also be
-- arriving via a paid campaign whose ROI we still want to measure even when
-- no affiliate is involved. These six columns capture that.
--
-- Idempotent: safe to re-run.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "utm_source"       varchar(128),
  ADD COLUMN IF NOT EXISTS "utm_medium"       varchar(128),
  ADD COLUMN IF NOT EXISTS "utm_campaign"     varchar(128),
  ADD COLUMN IF NOT EXISTS "utm_term"         varchar(128),
  ADD COLUMN IF NOT EXISTS "utm_content"      varchar(128),
  ADD COLUMN IF NOT EXISTS "landing_referrer" text;

-- Index supports per-campaign signup-count queries on the SuperAdmin dashboard.
CREATE INDEX IF NOT EXISTS "idx_users_utm_campaign" ON "users" ("utm_campaign")
  WHERE "utm_campaign" IS NOT NULL;

-- One referral row per referred user — the conversion lookup at
-- payment.ts:449 reads by `referred_user_id` and assumes uniqueness. Without
-- this, a retry of POST /register that somehow inserts twice would double-
-- credit affiliates on the next payment. Partial index = only enforced when
-- referred_user_id is non-null (the `ON DELETE SET NULL` from the FK leaves
-- legacy/orphaned rows with NULL we don't want to constrain).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_affiliate_referrals_referred_user"
  ON "affiliate_referrals" ("referred_user_id")
  WHERE "referred_user_id" IS NOT NULL;
