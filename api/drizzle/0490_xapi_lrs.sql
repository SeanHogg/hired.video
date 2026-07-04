-- Migration 0490 — Conformant xAPI 1.0.3 Learning Record Store (LRS).
--
-- The existing internal LRS (mig 0126: `xapi_statements`, user_id NOT NULL,
-- FK to a hired.video user + course enrollment) tracks OUR learners end to
-- end. It cannot receive statements from an EXTERNAL tool whose actor is an
-- arbitrary xAPI Agent (mbox / account) with no hired.video account — which
-- is exactly what "SCORM-Cloud-parity LRS" and the "company transitioning
-- in/out" portability story require.
--
-- This migration adds a SECOND, tenant-scoped, spec-conformant store that is
-- decoupled from internal enrollments:
--   lrs_credentials — Basic-auth key/secret pairs an external tool uses to
--                     talk to our LRS endpoint (base64(key_id:secret)).
--                     Mirrors the partner_api_keys design (prefix + SHA-256
--                     hash of the secret; secret shown once).
--   lrs_statements  — the conformant statement store, credential-scoped.
--                     `id` is the xAPI Statement id; `actor_ifi` is the
--                     canonical inverse-functional identifier used for the
--                     GET ?agent= filter; full statement kept in `statement`.
--   lrs_documents   — unified State / Activity Profile / Agent Profile
--                     document store (xAPI Document Resources). One table,
--                     `doc_type` discriminator; empty-string sentinels on the
--                     nullable key parts so the composite UNIQUE index (and
--                     therefore upsert-on-PUT) behaves.
--
-- See api/src/db/schema/learning.ts for the Drizzle SSoT and
-- api/src/services/learning/lrs-service.ts for the runtime.

-- ---------------------------------------------------------------------------
-- lrs_credentials
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "lrs_credentials" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  -- Owner = the actor who issued the credential (always set, audit trail).
  -- ownerCompanyId carries tenancy for a company-owned LRS; forwarding of
  -- inbound statements uses owner_user_id's external_lrs_targets rows.
  "owner_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "owner_company_id" uuid REFERENCES "company_profiles"("id") ON DELETE CASCADE,
  "label" varchar(200) NOT NULL,
  -- Basic-auth username. Public identifier, safe to display. `lrs_<hex>`.
  "key_id" varchar(48) NOT NULL,
  -- SHA-256 hex of the Basic-auth password (secret). Secret shown once.
  "secret_hash" text NOT NULL,
  -- 'read_write' | 'read' | 'write' — xAPI permission scoping.
  "permission" varchar(16) DEFAULT 'read_write' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "last_used_at" timestamptz,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_lrs_credentials_key_id" ON "lrs_credentials" ("key_id");
CREATE INDEX IF NOT EXISTS "idx_lrs_credentials_owner_user" ON "lrs_credentials" ("owner_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_lrs_credentials_owner_company" ON "lrs_credentials" ("owner_company_id", "created_at");

-- ---------------------------------------------------------------------------
-- lrs_statements — conformant, immutable-once-stored statement store
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "lrs_statements" (
  -- xAPI Statement id (client-provided on PUT, minted on POST when absent).
  "id" uuid PRIMARY KEY NOT NULL,
  "credential_id" uuid NOT NULL REFERENCES "lrs_credentials"("id") ON DELETE CASCADE,
  -- Canonical actor inverse-functional identifier for the ?agent= filter,
  -- e.g. "mbox::mailto:a@b.com" | "account::<homePage>::<name>".
  "actor_ifi" text NOT NULL,
  "verb_id" text NOT NULL,
  "object_id" text,
  "object_type" varchar(40) DEFAULT 'Activity' NOT NULL,
  -- xAPI registration context id (ties statements to one attempt/launch).
  "registration" uuid,
  -- Full, canonicalised statement document (with authority + stored + id).
  "statement" jsonb NOT NULL,
  -- Voiding: a voiding statement flips `voided` on its target.
  "voided" boolean DEFAULT false NOT NULL,
  "voided_by_id" uuid,
  "stored" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_lrs_statements_cred_stored" ON "lrs_statements" ("credential_id", "stored");
CREATE INDEX IF NOT EXISTS "idx_lrs_statements_cred_actor" ON "lrs_statements" ("credential_id", "actor_ifi", "stored");
CREATE INDEX IF NOT EXISTS "idx_lrs_statements_cred_verb" ON "lrs_statements" ("credential_id", "verb_id", "stored");
CREATE INDEX IF NOT EXISTS "idx_lrs_statements_cred_object" ON "lrs_statements" ("credential_id", "object_id", "stored");
CREATE INDEX IF NOT EXISTS "idx_lrs_statements_cred_reg" ON "lrs_statements" ("credential_id", "registration");

-- ---------------------------------------------------------------------------
-- lrs_documents — State / Activity Profile / Agent Profile document resources
-- ---------------------------------------------------------------------------
-- The three nullable key parts default to '' (not NULL) so the composite
-- UNIQUE index treats "absent" as a single value — Postgres treats NULLs as
-- distinct, which would break the PUT/POST upsert. Which parts are relevant
-- depends on doc_type:
--   state            → activity_id + agent_ifi + registration + document_key(stateId)
--   activity_profile → activity_id + document_key(profileId)
--   agent_profile    → agent_ifi   + document_key(profileId)
CREATE TABLE IF NOT EXISTS "lrs_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "credential_id" uuid NOT NULL REFERENCES "lrs_credentials"("id") ON DELETE CASCADE,
  "doc_type" varchar(20) NOT NULL,
  "activity_id" text DEFAULT '' NOT NULL,
  "agent_ifi" text DEFAULT '' NOT NULL,
  "registration" text DEFAULT '' NOT NULL,
  "document_key" text NOT NULL,
  "content_type" varchar(255) DEFAULT 'application/json' NOT NULL,
  "content" text NOT NULL,
  -- Weak ETag (SHA-256 of content) for If-Match / If-None-Match concurrency.
  "etag" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_lrs_documents_key" ON "lrs_documents"
  ("credential_id", "doc_type", "activity_id", "agent_ifi", "registration", "document_key");
CREATE INDEX IF NOT EXISTS "idx_lrs_documents_lookup" ON "lrs_documents"
  ("credential_id", "doc_type", "activity_id", "agent_ifi", "updated_at");
