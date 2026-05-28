-- Migration 0173 — Reference management (#1677). NDA-protected,
-- selectively-shared reference packets for the senior-exec audience.
-- Idempotent: CREATE TABLE / INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS "reference_contacts" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name"          varchar(200) NOT NULL,
  "title"         varchar(200),
  "company"       varchar(200),
  "email"         varchar(255),
  "phone"         varchar(50),
  "relationship"  varchar(120),
  "notes"         text,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "reference_contacts_owner_idx"
  ON "reference_contacts" ("owner_user_id");

CREATE TABLE IF NOT EXISTS "reference_shares" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_user_id"     uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token"             varchar(64) NOT NULL,
  "shared_with_email" varchar(255) NOT NULL,
  "contact_ids"       jsonb NOT NULL DEFAULT '[]'::jsonb,
  "label"             varchar(255),
  "require_nda"       boolean NOT NULL DEFAULT true,
  "nda_accepted_at"   timestamptz,
  "expires_at"        timestamptz,
  "revoked_at"        timestamptz,
  "first_viewed_at"   timestamptz,
  "created_at"        timestamptz NOT NULL DEFAULT now(),
  "updated_at"        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "reference_shares_owner_idx"
  ON "reference_shares" ("owner_user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "reference_shares_token_uniq"
  ON "reference_shares" ("token");
