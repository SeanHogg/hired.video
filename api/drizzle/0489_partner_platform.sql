-- Migration 0489 — Partner platform integration (Hired.Video SDK).
--
-- Introduces the three tables that let an external partner platform (e.g.
-- builderforce.ai) create/connect Hired.Video job-seeker accounts and embed
-- their profile/resume via the `@hiredvideo/sdk` package:
--   partners             — the external platform record (SuperAdmin-provisioned)
--   partner_api_keys     — system-to-system credentials (prefix + SHA-256 hash)
--   partner_connections  — consent-gated link between a partner and a user
--
-- See api/src/db/schema/partners.ts for the Drizzle SSoT.

CREATE TABLE IF NOT EXISTS "partners" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(200) NOT NULL,
  "slug" varchar(80) NOT NULL UNIQUE,
  "contact_email" varchar(255),
  "website_url" text,
  "logo_url" text,
  "owner_user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE,
  "request_note" text,
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "approved_at" timestamptz,
  "approved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_partners_status" ON "partners" ("status");
CREATE INDEX IF NOT EXISTS "idx_partners_owner" ON "partners" ("owner_user_id");

CREATE TABLE IF NOT EXISTS "partner_api_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "partner_id" uuid NOT NULL REFERENCES "partners"("id") ON DELETE CASCADE,
  "label" varchar(200) NOT NULL,
  "key_prefix" varchar(16) NOT NULL,
  "key_hash" text NOT NULL,
  "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "allowed_origins" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "last_used_at" timestamptz,
  "expires_at" timestamptz,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_partner_api_keys_hash" ON "partner_api_keys" ("key_hash");
CREATE INDEX IF NOT EXISTS "idx_partner_api_keys_partner" ON "partner_api_keys" ("partner_id");

CREATE TABLE IF NOT EXISTS "partner_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "partner_id" uuid NOT NULL REFERENCES "partners"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "external_user_id" varchar(255),
  "source" varchar(20) NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "consent_agreed_at" timestamptz,
  "consent_ip" varchar(45),
  "revoked_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_partner_connections_partner_user" ON "partner_connections" ("partner_id", "user_id");
CREATE INDEX IF NOT EXISTS "idx_partner_connections_user" ON "partner_connections" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_partner_connections_partner" ON "partner_connections" ("partner_id");
