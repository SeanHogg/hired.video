-- Migration: platform pricing single-row config
--
-- Backs the SuperAdmin /admin/pricing page. The public /pricing page and
-- api/src/routes/billing.ts read from this row instead of the hardcoded
-- $29/$39/$49 SEAT_PRICES map (which was stale; every seat is $9.95).
--
-- Initial values mirror shared/pricing.ts (PRO_MONTHLY_PRICE = 9.95, yearly
-- = monthly × 12 × 0.8 = 95.52) so behaviour is unchanged on day one.

CREATE TABLE IF NOT EXISTS platform_pricing (
  id VARCHAR(32) PRIMARY KEY,
  pro_monthly_cents INTEGER NOT NULL,
  pro_yearly_cents INTEGER NOT NULL,
  seat_price_cents INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO platform_pricing (id, pro_monthly_cents, pro_yearly_cents, seat_price_cents)
VALUES ('singleton', 995, 9552, 995)
ON CONFLICT (id) DO NOTHING;
