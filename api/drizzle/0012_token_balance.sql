-- Migration: 0012_token_balance
-- Adds true token-metering support: a per-user purchased token balance
-- (`user_token_balance`), an audit log of pack purchases
-- (`token_pack_purchases`), and a `source` discriminator on
-- `ai_usage_records` so we can tell whether a call was billed against the
-- monthly subscription allowance or the purchased pack balance.
--
-- See memory/project_token_pricing.md for the design decision.
-- Idempotent: safe to re-run.

-- ── ai_usage_records: add source column ────────────────────────────────────
ALTER TABLE "ai_usage_records"
  ADD COLUMN IF NOT EXISTS "source" varchar(20) NOT NULL DEFAULT 'monthly';

-- ── user_token_balance ─────────────────────────────────────────────────────
-- Schema note: `id` is the PK; `user_id` is uniquely constrained.
-- (Drizzle's type inference misbehaves when a column is both PK and FK,
--  so we use a separate id column.)
CREATE TABLE IF NOT EXISTS "user_token_balance" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "balance" integer NOT NULL DEFAULT 0,
  "lifetime_granted" integer NOT NULL DEFAULT 0,
  "lifetime_consumed" integer NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ── token_pack_purchases (audit log) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "token_pack_purchases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "pack_id" varchar(50) NOT NULL,
  "tokens_granted" integer NOT NULL,
  "price_paid" numeric NOT NULL,
  "currency" varchar(3) NOT NULL DEFAULT 'USD',
  "stripe_payment_intent_id" varchar(100),
  "status" varchar(20) NOT NULL DEFAULT 'paid',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "token_pack_purchases_user_id_idx"
  ON "token_pack_purchases" ("user_id");

CREATE INDEX IF NOT EXISTS "token_pack_purchases_stripe_pi_idx"
  ON "token_pack_purchases" ("stripe_payment_intent_id");
