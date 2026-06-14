-- Migration 0320 — realign `company_subscriptions.price_per_seat_cents` to the
-- canonical $9.95 seat price (TK2 billing track).
--
-- Background: the column shipped with a stale 4900¢ ($49) default that
-- contradicts the product — "every seat / creator is $9.95" (995¢, see
-- shared/pricing.ts SEAT_PRICE_CENTS + project_pricing_seats). The workforce
-- reconciler (#1409) already stamps 995 explicitly, and the seat PATCH route
-- writes the runtime PricingConfig price, but:
--   (a) the DB column DEFAULT was still 4900, so any row inserted via a path
--       that omitted the price (or a future raw insert) silently billed $49;
--   (b) ~rows seeded under the old default still carry 4900.
--
-- Fix: move the DEFAULT to 995, then backfill the leftover stale rows. A row
-- at exactly 4900 is an old-default artifact (no flow intentionally sets $49),
-- so converting them to 995 aligns billing with the product. Negotiated /
-- admin-set non-995, non-4900 prices are left untouched.
--
-- Idempotent: SET DEFAULT is declarative; the UPDATE only touches 4900 rows so
-- replays are no-ops. Matching Drizzle declaration: api/src/db/schema/billing.ts.

ALTER TABLE "company_subscriptions"
  ALTER COLUMN "price_per_seat_cents" SET DEFAULT 995;

UPDATE "company_subscriptions"
  SET "price_per_seat_cents" = 995,
      "updated_at" = now()
  WHERE "price_per_seat_cents" = 4900;
