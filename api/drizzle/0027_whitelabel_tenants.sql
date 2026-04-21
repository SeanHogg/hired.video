-- Migration: 0027_whitelabel_tenants
--
-- Creates the `whitelabel_tenants` table (gap #75). The drizzle schema
-- `db/schema/whitelabel.ts` has existed in the repo since the gap was
-- implemented, but the SQL migration was never authored — so the table
-- was never actually created in production. The 2026-04-21 recruiting
-- platform migration (0028) FK-references this table for agency brand
-- kits, surfacing the miss.
--
-- Columns match the drizzle schema verbatim. Idempotent via
-- IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS "whitelabel_tenants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "subdomain" varchar(63) NOT NULL UNIQUE,
  "name" varchar(255) NOT NULL,
  "tenant_type" varchar(50) NOT NULL DEFAULT 'agency',
  "primary_color" varchar(20) DEFAULT '#2563eb',
  "logo_url" text,
  "hero_headline" varchar(200),
  "website" text,
  "contact_email" varchar(255),
  "plan_tier" varchar(50) NOT NULL DEFAULT 'starter',
  "monthly_fee_usd" numeric DEFAULT '499',
  "stripe_subscription_id" text,
  "custom_domain" varchar(255) UNIQUE,
  "config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "whitelabel_tenants_owner_id_idx"
  ON "whitelabel_tenants" ("owner_id");

CREATE INDEX IF NOT EXISTS "whitelabel_tenants_tenant_type_idx"
  ON "whitelabel_tenants" ("tenant_type");
