-- Migration 0114 — Create missing affiliate marketplace tables (closes #1180).
--
-- Root cause: `api/src/db/schema/affiliates.ts` declares six affiliate
-- tables (affiliate_profiles, affiliate_referrals, affiliate_conversions,
-- affiliate_payouts, affiliate_tiers, affiliate_link_clicks) but no
-- migration in `api/drizzle/` ever runs `CREATE TABLE` for any of them.
-- Production happens to have the first five from a legacy push, so
-- migration 0112_sector_taxonomy.sql succeeded on its ALTERs against
-- `affiliate_profiles` + `affiliate_referrals`, then failed on
-- `affiliate_link_clicks` ("relation does not exist") on every deploy.
-- A fresh DB would fail signup outright — `AuthService.register` calls
-- `INSERT INTO affiliate_profiles ...` when `enableAffiliate` is true.
--
-- Fix shape:
--   1. CREATE TABLE IF NOT EXISTS for every affiliate table the schema
--      declares. Columns mirror `api/src/db/schema/affiliates.ts` exactly,
--      including the `landing_sector` / `specialty_sectors` columns that
--      migration 0112 also tries to add (so a fresh DB lands directly in
--      the post-0112 shape without re-running its ALTERs).
--   2. ALTER TABLE ... ADD COLUMN IF NOT EXISTS for the 0112 columns,
--      so partial-state environments (e.g. production after 0112) that
--      already have the columns are no-ops, and any pre-0112 DB that
--      somehow exists gets the columns now.
--   3. Re-create the partial indexes from 0112 that never ran against
--      `affiliate_link_clicks` because the table did not exist.
--
-- Idempotent on every re-run. FK creation order: profiles → referrals →
-- everything else (conversions / payouts / link_clicks reference referrals
-- via SET NULL).

-- ─── 1. affiliate_profiles ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "affiliate_profiles" (
  "id"                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"           UUID         NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "referral_code"     VARCHAR(50)  NOT NULL UNIQUE,
  "commission_rate"   NUMERIC      NOT NULL DEFAULT 0.10,
  "status"            VARCHAR(50)  NOT NULL DEFAULT 'pending',
  "total_earned"      NUMERIC      NOT NULL DEFAULT 0,
  "total_paid"        NUMERIC      NOT NULL DEFAULT 0,
  "payout_email"      VARCHAR(255),
  "specialty_sectors" JSONB        NOT NULL DEFAULT '[]'::jsonb,
  "created_at"        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updated_at"        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── 2. affiliate_referrals ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "affiliate_referrals" (
  "id"                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "affiliate_id"      UUID         NOT NULL REFERENCES "affiliate_profiles"("id") ON DELETE CASCADE,
  "referred_user_id"  UUID         REFERENCES "users"("id") ON DELETE SET NULL,
  "referral_code"     VARCHAR(50)  NOT NULL,
  "ip_address"        VARCHAR(45),
  "user_agent"        TEXT,
  "landing_sector"    VARCHAR(64),
  "converted_at"      TIMESTAMPTZ,
  "created_at"        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── 3. affiliate_conversions ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "affiliate_conversions" (
  "id"               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "affiliate_id"     UUID         NOT NULL REFERENCES "affiliate_profiles"("id") ON DELETE CASCADE,
  "referral_id"      UUID         REFERENCES "affiliate_referrals"("id") ON DELETE SET NULL,
  "conversion_type"  VARCHAR(100) NOT NULL,
  "revenue"          NUMERIC      NOT NULL,
  "commission"       NUMERIC      NOT NULL,
  "status"           VARCHAR(50)  NOT NULL DEFAULT 'pending',
  "paid_at"          TIMESTAMPTZ,
  "created_at"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updated_at"       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── 4. affiliate_payouts ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "affiliate_payouts" (
  "id"               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "affiliate_id"     UUID         NOT NULL REFERENCES "affiliate_profiles"("id") ON DELETE CASCADE,
  "amount"           NUMERIC      NOT NULL,
  "currency"         VARCHAR(10)  NOT NULL DEFAULT 'USD',
  "status"           VARCHAR(50)  NOT NULL DEFAULT 'pending',
  "payout_method"    VARCHAR(50),
  "transaction_id"   TEXT,
  "processed_at"     TIMESTAMPTZ,
  "created_at"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updated_at"       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── 5. affiliate_tiers ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "affiliate_tiers" (
  "id"                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"              VARCHAR(50)  NOT NULL UNIQUE,
  "label"             VARCHAR(100) NOT NULL,
  "min_conversions"   INTEGER      NOT NULL DEFAULT 0,
  "commission_rate"   NUMERIC      NOT NULL,
  "bonus_percentage"  NUMERIC      NOT NULL DEFAULT 0,
  "perks"             JSONB        DEFAULT '[]'::jsonb,
  "created_at"        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── 6. affiliate_link_clicks ──────────────────────────────────────────
-- The table whose absence was failing the deploy. Per-click tracking for
-- affiliate links + UTM-level analytics. References affiliate_referrals
-- via convertedReferralId so a click that later converts can be back-
-- linked into the funnel.
CREATE TABLE IF NOT EXISTS "affiliate_link_clicks" (
  "id"                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "affiliate_id"          UUID         NOT NULL REFERENCES "affiliate_profiles"("id") ON DELETE CASCADE,
  "referral_code"         VARCHAR(50)  NOT NULL,
  "target_path"           VARCHAR(500),
  "ip_address"            VARCHAR(45),
  "user_agent"            TEXT,
  "referer"               TEXT,
  "converted_referral_id" UUID         REFERENCES "affiliate_referrals"("id") ON DELETE SET NULL,
  "landing_sector"        VARCHAR(64),
  "clicked_at"            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── Replay 0112's ALTERs idempotently ─────────────────────────────────
-- On a fresh DB the CREATE TABLEs above already include these columns;
-- these ALTERs are no-ops. On a pre-0112 partial-state DB (if any exists)
-- they catch up the columns now so the sector indexes below can be built.
ALTER TABLE "affiliate_profiles"
  ADD COLUMN IF NOT EXISTS "specialty_sectors" JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "affiliate_referrals"
  ADD COLUMN IF NOT EXISTS "landing_sector" VARCHAR(64);

ALTER TABLE "affiliate_link_clicks"
  ADD COLUMN IF NOT EXISTS "landing_sector" VARCHAR(64);

-- ─── Replay 0112's sector indexes ──────────────────────────────────────
-- The affiliate_link_clicks index never ran in 0112 because the table did
-- not exist. The affiliate_referrals index DID run in 0112 against the
-- legacy-pushed table — IF NOT EXISTS makes that idempotent here.
CREATE INDEX IF NOT EXISTS "idx_affiliate_referrals_sector"
  ON "affiliate_referrals" ("landing_sector", "created_at" DESC)
  WHERE "landing_sector" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_affiliate_link_clicks_sector"
  ON "affiliate_link_clicks" ("landing_sector", "clicked_at" DESC)
  WHERE "landing_sector" IS NOT NULL;
