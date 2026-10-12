-- Migration 0500 — SuperAdmin coupon codes (free month of Pro).
--
-- A SuperAdmin issues a code; a signed-in user redeems it and receives a
-- time-boxed Pro comp. The grant itself is a `user_plan_overrides` row
-- (plan_slug='pro', expires_at = end of the comp) so every existing Pro gate
-- (requirePro, services-processor caps, token budget, post-channel gate)
-- honours it with no further change. These tables only record the codes and
-- who redeemed them.
--
-- coupon_codes.redemption_count is a deliberate denormalisation of
-- COUNT(coupon_redemptions): the neon-http driver has no interactive
-- transactions, so the max_redemptions cap is enforced by one atomic
-- conditional UPDATE on this counter. Single writer: the redeem use case
-- (services/coupons/couponUseCases.ts), which also compensates on failure.
--
-- Idempotent: IF NOT EXISTS throughout.

CREATE TABLE IF NOT EXISTS coupon_codes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             varchar(32) NOT NULL,
  duration_days    integer NOT NULL DEFAULT 30
                   CHECK (duration_days BETWEEN 1 AND 365),
  max_redemptions  integer CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  redemption_count integer NOT NULL DEFAULT 0 CHECK (redemption_count >= 0),
  expires_at       timestamptz,
  is_active        boolean NOT NULL DEFAULT true,
  note             text NOT NULL DEFAULT '',
  created_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Codes are stored upper-case; lookup is by exact code.
CREATE UNIQUE INDEX IF NOT EXISTS uq_coupon_codes_code ON coupon_codes (code);

-- SuperAdmin list: newest first.
CREATE INDEX IF NOT EXISTS idx_coupon_codes_created ON coupon_codes (created_at DESC);

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id     uuid NOT NULL REFERENCES coupon_codes(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_until timestamptz NOT NULL,
  redeemed_at   timestamptz NOT NULL DEFAULT now()
);

-- One redemption per user per code.
CREATE UNIQUE INDEX IF NOT EXISTS uq_coupon_redemptions_coupon_user
  ON coupon_redemptions (coupon_id, user_id);

-- SuperAdmin per-code redemption list: newest first.
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon_redeemed
  ON coupon_redemptions (coupon_id, redeemed_at DESC);

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_user ON coupon_redemptions (user_id);
