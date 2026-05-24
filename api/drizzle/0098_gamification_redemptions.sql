-- Phase 3: point redemptions ledger.
-- One row per "user spent points for something". Status drives the
-- fulfillment lifecycle: AI credits + premium-month complete sync;
-- gift cards walk through Tremendous async.

CREATE TABLE IF NOT EXISTS "point_redemptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "sku_id" varchar(80) NOT NULL,
  "kind" varchar(30) NOT NULL,
  "points_cost" integer NOT NULL,
  "value_cents" integer NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "vendor_order_id" varchar(100),
  "grant_payload" jsonb NOT NULL,
  "fulfilled_at" timestamptz,
  "failure_reason" text,
  "requires_kyc" boolean NOT NULL DEFAULT false,
  "kyc_completed_at" timestamptz,
  "approved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "approved_at" timestamptz,
  "metadata" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "point_redemptions_user_created_idx"
  ON "point_redemptions" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "point_redemptions_status_idx"
  ON "point_redemptions" ("status");
CREATE INDEX IF NOT EXISTS "point_redemptions_vendor_order_idx"
  ON "point_redemptions" ("vendor_order_id");

-- W-9 collection state. One row per user; populated when they cross the
-- $599 YTD redemption threshold. SuperAdmin can pre-populate (e.g. for
-- a known creator who hits the threshold next month).
CREATE TABLE IF NOT EXISTS "user_tax_status" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "w9_collected_at" timestamptz,
  -- "personal" | "business" — drives 1099-MISC vs 1099-NEC.
  "tax_classification" varchar(20),
  -- Last 4 of EIN/SSN for partial display; NEVER store the full id.
  "tax_id_last4" varchar(4),
  "legal_name" text,
  "address" jsonb,
  "ytd_redemption_cents" integer NOT NULL DEFAULT 0,
  "ytd_redemption_year" integer NOT NULL DEFAULT EXTRACT(YEAR FROM NOW()),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
