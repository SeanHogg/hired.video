-- Migration 0494 — Pro is $1.99/month (job-seeker focus, owner decision
-- 2026-10-03; ROADMAP #2297).
--
-- Moves the two stored copies of the Pro price to match shared/pricing.ts
-- (PRO_MONTHLY_PRICE = 1.99, yearly = 1.99 × 12 × 0.8 = 19.10):
--   * platform_pricing  — admin-editable config read by /pricing
--   * subscription_plans — the row POST /api/billing/subscribe charges from
-- Seat pricing (platform_pricing.seat_price_cents, SEAT_PRICE_CENTS = 995) is
-- intentionally untouched. Existing subscriptions keep their recorded price.
--
-- Idempotent: plain UPDATEs to fixed values; re-running is a no-op.

UPDATE platform_pricing
SET pro_monthly_cents = 199,
    pro_yearly_cents = 1910,
    updated_at = NOW()
WHERE id = 'singleton'
  AND (pro_monthly_cents <> 199 OR pro_yearly_cents <> 1910);

UPDATE subscription_plans
SET price_monthly = 1.99,
    price_yearly = 19.10
WHERE slug = 'pro'
  AND (price_monthly <> 1.99 OR price_yearly IS DISTINCT FROM 19.10);
