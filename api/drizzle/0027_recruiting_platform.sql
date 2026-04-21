-- Migration: 0027_recruiting_platform
--
-- Foundation tables for the agency recruiting workflow (week 1 MVP of
-- gap #99 class). Adds:
--   • candidate_resumes — agency-owned copy of a candidate's resume,
--     PRIVATE to the company. Variant tree via parent_id with one active
--     descendant per candidate. Optional linked_user_id for post-signup
--     merge via ResumeConsolidator.
--   • redaction_profiles — reusable per-company rule sets for stripping
--     PII before external sharing. One default per company.
--   • candidate_resume_shares — tokenized branded + redacted resume share
--     link. Applies a redaction profile and (optionally) a whitelabel
--     tenant brand kit at render time.
--   • pitch_decks + pitch_deck_candidates + pitch_deck_shares — recruiter-
--     authored collection of redacted/branded candidates with tokenized
--     public share for hiring-company review (#184 feedback loop is v2).
--
-- Week-2 gaps #184–#189 (pitch deck feedback, authenticated collection
-- view, candidate consent + GDPR audit, template extractor, template
-- marketplace review, merge.dev unified ATS) are tracked separately.

-- ─── 1. candidate_resumes ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "candidate_resumes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "company_profiles"("id") ON DELETE CASCADE,
  "imported_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "talent_pool_candidate_id" uuid REFERENCES "talent_pool_candidates"("id") ON DELETE SET NULL,
  "linked_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "merged_from_user_resume_id" uuid REFERENCES "resume_information"("id") ON DELETE SET NULL,
  "parent_id" uuid REFERENCES "candidate_resumes"("id") ON DELETE SET NULL,
  "is_active" boolean NOT NULL DEFAULT false,
  "label" varchar(255),
  "content" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "recruiter_notes" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "candidate_resumes_company_id_idx"
  ON "candidate_resumes" ("company_id");

CREATE INDEX IF NOT EXISTS "candidate_resumes_talent_pool_candidate_id_idx"
  ON "candidate_resumes" ("talent_pool_candidate_id");

CREATE INDEX IF NOT EXISTS "candidate_resumes_linked_user_id_idx"
  ON "candidate_resumes" ("linked_user_id");

CREATE INDEX IF NOT EXISTS "candidate_resumes_parent_id_idx"
  ON "candidate_resumes" ("parent_id");

-- At most one active variant per (company, talent_pool_candidate). Rows
-- without a talent_pool_candidate_id are excluded so free-standing uploads
-- don't collide.
CREATE UNIQUE INDEX IF NOT EXISTS "candidate_resumes_active_per_candidate_unique"
  ON "candidate_resumes" ("company_id", "talent_pool_candidate_id")
  WHERE "is_active" = true AND "talent_pool_candidate_id" IS NOT NULL;


-- ─── 2. redaction_profiles ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "redaction_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "company_profiles"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "description" text,
  "is_default" boolean NOT NULL DEFAULT false,
  "hide_name" boolean NOT NULL DEFAULT true,
  "hide_email" boolean NOT NULL DEFAULT true,
  "hide_phone" boolean NOT NULL DEFAULT true,
  "hide_address" boolean NOT NULL DEFAULT true,
  "hide_linkedin" boolean NOT NULL DEFAULT true,
  "hide_other_urls" boolean NOT NULL DEFAULT false,
  "hide_avatar" boolean NOT NULL DEFAULT true,
  "replacement_name" varchar(100) NOT NULL DEFAULT 'Candidate',
  -- Job-share use case: strip identifying employer/company names.
  "hide_company_names" boolean NOT NULL DEFAULT false,
  "hide_school_names" boolean NOT NULL DEFAULT false,
  -- Extra dotted paths into the resume JSON to strip (e.g. "basics.location.city").
  "extra_strip_paths" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "redaction_profiles_company_id_idx"
  ON "redaction_profiles" ("company_id");

CREATE UNIQUE INDEX IF NOT EXISTS "redaction_profiles_company_default_unique"
  ON "redaction_profiles" ("company_id")
  WHERE "is_default" = true;


-- ─── 3. candidate_resume_shares ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "candidate_resume_shares" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "company_profiles"("id") ON DELETE CASCADE,
  "candidate_resume_id" uuid NOT NULL REFERENCES "candidate_resumes"("id") ON DELETE CASCADE,
  "redaction_profile_id" uuid REFERENCES "redaction_profiles"("id") ON DELETE SET NULL,
  -- Brand kit: reuse whitelabel_tenants (subdomain, logo, primaryColor,
  -- customDomain). NULL = no branding overlay.
  "whitelabel_tenant_id" uuid REFERENCES "whitelabel_tenants"("id") ON DELETE SET NULL,
  "shared_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "share_token" varchar(64) NOT NULL UNIQUE,
  "name" varchar(255),
  "recipient_email" varchar(255),
  "expires_at" timestamptz,
  "is_active" boolean NOT NULL DEFAULT true,
  "view_count" integer NOT NULL DEFAULT 0,
  "last_viewed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "candidate_resume_shares_company_id_idx"
  ON "candidate_resume_shares" ("company_id");

CREATE INDEX IF NOT EXISTS "candidate_resume_shares_candidate_resume_id_idx"
  ON "candidate_resume_shares" ("candidate_resume_id");

CREATE INDEX IF NOT EXISTS "candidate_resume_shares_token_idx"
  ON "candidate_resume_shares" ("share_token");


-- ─── 4. pitch_decks ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "pitch_decks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "company_profiles"("id") ON DELETE CASCADE,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "job_id" uuid REFERENCES "job_items"("id") ON DELETE SET NULL,
  "whitelabel_tenant_id" uuid REFERENCES "whitelabel_tenants"("id") ON DELETE SET NULL,
  "redaction_profile_id" uuid REFERENCES "redaction_profiles"("id") ON DELETE SET NULL,
  -- draft | sent | archived
  "status" varchar(50) NOT NULL DEFAULT 'draft',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "pitch_decks_company_id_idx"
  ON "pitch_decks" ("company_id");

CREATE INDEX IF NOT EXISTS "pitch_decks_job_id_idx"
  ON "pitch_decks" ("job_id");


-- ─── 5. pitch_deck_candidates ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "pitch_deck_candidates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "deck_id" uuid NOT NULL REFERENCES "pitch_decks"("id") ON DELETE CASCADE,
  "candidate_resume_id" uuid NOT NULL REFERENCES "candidate_resumes"("id") ON DELETE CASCADE,
  "display_order" integer NOT NULL DEFAULT 0,
  -- Per-slide redaction override; NULL = inherit deck default.
  "redaction_profile_id" uuid REFERENCES "redaction_profiles"("id") ON DELETE SET NULL,
  "fit_summary" text,
  "match_score" integer,
  "recruiter_notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "pitch_deck_candidates_deck_id_idx"
  ON "pitch_deck_candidates" ("deck_id");

CREATE UNIQUE INDEX IF NOT EXISTS "pitch_deck_candidates_deck_candidate_unique"
  ON "pitch_deck_candidates" ("deck_id", "candidate_resume_id");


-- ─── 6. pitch_deck_shares ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "pitch_deck_shares" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "deck_id" uuid NOT NULL REFERENCES "pitch_decks"("id") ON DELETE CASCADE,
  "shared_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "share_token" varchar(64) NOT NULL UNIQUE,
  "recipient_name" varchar(255),
  "recipient_email" varchar(255),
  "expires_at" timestamptz,
  "is_active" boolean NOT NULL DEFAULT true,
  "view_count" integer NOT NULL DEFAULT 0,
  "last_viewed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "pitch_deck_shares_deck_id_idx"
  ON "pitch_deck_shares" ("deck_id");

CREATE INDEX IF NOT EXISTS "pitch_deck_shares_token_idx"
  ON "pitch_deck_shares" ("share_token");
