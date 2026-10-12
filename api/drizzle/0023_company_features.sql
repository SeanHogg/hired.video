-- Migration: 0023_company_features
--
-- Replaces the fabricated fields that used to be hardcoded in
-- rowToCompanyProfile (locations[], teamMembers[], benefits booleans,
-- culture, values, mission, vision, technologies, perks, tagline,
-- views) with real persisted data.
--
-- Additions:
--   • company_profiles: tagline, mission, vision + flat jsonb arrays for
--     technologies/perks/culture/values + structured benefits jsonb.
--   • company_locations: normalised table for multi-office support.
--   • company_team_members: structured team cards, optionally linked to
--     a real user account.
--   • company_views: per-view event log (mirrors resume_views) — aggregate
--     counts drive the `views` field on the company DTO.

ALTER TABLE "company_profiles"
  ADD COLUMN IF NOT EXISTS "tagline" varchar(255),
  ADD COLUMN IF NOT EXISTS "mission" text,
  ADD COLUMN IF NOT EXISTS "vision" text,
  ADD COLUMN IF NOT EXISTS "technologies" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "perks" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "culture" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "values" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "benefits" jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS "company_locations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "company_profiles"("id") ON DELETE CASCADE,
  "label" varchar(100),
  "address" varchar(255),
  "city" varchar(100),
  "region" varchar(100),
  "postal_code" varchar(20),
  "country_code" varchar(8),
  "is_primary" boolean NOT NULL DEFAULT false,
  "display_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "company_locations_company_id_idx"
  ON "company_locations" ("company_id");

CREATE TABLE IF NOT EXISTS "company_team_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "company_profiles"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "name" varchar(255) NOT NULL,
  "title" varchar(255),
  "bio" text,
  "avatar_url" text,
  "linkedin_url" text,
  "display_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "company_team_members_company_id_idx"
  ON "company_team_members" ("company_id");

CREATE UNIQUE INDEX IF NOT EXISTS "company_team_members_company_user_unique"
  ON "company_team_members" ("company_id", "user_id")
  WHERE "user_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "company_views" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "company_profiles"("id") ON DELETE CASCADE,
  "viewer_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "ip_hash" varchar(64),
  "referrer" text,
  "user_agent" text,
  "viewed_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "company_views_company_id_idx"
  ON "company_views" ("company_id");

CREATE INDEX IF NOT EXISTS "company_views_viewed_at_idx"
  ON "company_views" ("viewed_at");
