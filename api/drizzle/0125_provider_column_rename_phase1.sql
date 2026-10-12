-- Migration 0125 — Phase 1 of the provider-column rename (#388).
--
-- The legacy `payment_methods.stripe_payment_method_id` column has
-- stored Helcim cardTokens since the multi-provider port. The name
-- misleads: a junior reading the schema sees "stripe" and assumes the
-- column is Stripe-only. Same for `users.stripe_customer_id` which now
-- holds Helcim `CST…` codes.
--
-- This phase 1 migration adds new provider-neutral columns + backfills
-- from the legacy columns. The old columns stay in place for a
-- deprecation window so existing webhook lookups + the legacy
-- `getUserIdByStripeCustomer` helper keep working until the code
-- rename (tracked as a follow-on gap-register entry) lands.
--
-- Phase 2 (separate migration, after code rename): drop the legacy
-- columns + the supporting indexes.

ALTER TABLE "payment_methods"
  ADD COLUMN IF NOT EXISTS "provider_payment_method_id" text,
  ADD COLUMN IF NOT EXISTS "provider"                   varchar(24);
UPDATE "payment_methods"
SET    "provider_payment_method_id" = "stripe_payment_method_id",
       "provider"                   = COALESCE("provider", 'stripe')
WHERE  "provider_payment_method_id" IS NULL;
CREATE INDEX IF NOT EXISTS "idx_payment_methods_provider_payment_method_id"
  ON "payment_methods" ("provider_payment_method_id");

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "provider_customer_id" text;
UPDATE "users"
SET    "provider_customer_id" = "stripe_customer_id"
WHERE  "provider_customer_id" IS NULL AND "stripe_customer_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "uq_users_provider_customer_id"
  ON "users" ("provider_customer_id")
  WHERE "provider_customer_id" IS NOT NULL;
