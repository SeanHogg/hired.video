-- Migration 0049 — Integrations registry + cache-first sourcing + GDPR/CCPA compliance.
--
-- Implements gap #96 (enrichment provider integration) end-to-end:
--   * Single `integrations` table covers system-shipped providers AND
--     creator-built ones. Differentiated via `kind`.
--   * Per-integration credentials are stored separately so we can rotate
--     keys without touching the registry row.
--   * `people` is the canonical merged identity. `person_identifiers` is
--     the unique-keyed lookup index across email/LinkedIn/GitHub/etc.
--   * `enrichment_cache` underpins the cache-first resolver — if we've
--     paid for a lookup once, we don't pay again until TTL expiry.
--   * `data_subject_requests` + `data_suppression_list` are the GDPR/CCPA
--     compliance rails: erasure removes a person AND prevents re-import.
-- See api/src/services/sourcing/* and api/src/routes/integrations.ts.

-- ---------------------------------------------------------------------------
-- Integrations registry
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS integrations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            VARCHAR(64) NOT NULL UNIQUE,
  display_name    VARCHAR(128) NOT NULL,
  -- 'system' = ships with the platform; 'creator' = submitted by a creator.
  kind            VARCHAR(16) NOT NULL DEFAULT 'system',
  -- 'enrichment' | 'sourcing' | 'data_dump' | 'job_board' | 'other'.
  category        VARCHAR(32) NOT NULL,
  -- 'free' | 'paid' | 'freemium'. Drives default UI labels and credit math.
  pricing_model   VARCHAR(16) NOT NULL DEFAULT 'paid',
  cost_per_call_cents INTEGER NOT NULL DEFAULT 0,
  description     TEXT,
  homepage_url    TEXT,
  docs_url        TEXT,
  -- Configuration schema (JSON Schema fragment) — frontend renders config form from this.
  config_schema   JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Per-integration capability flags so the resolver can route by required field.
  capabilities    JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Globally enabled by SuperAdmin? Defaults to FALSE so paid providers don't
  -- accidentally consume credits the moment they're registered.
  enabled         BOOLEAN NOT NULL DEFAULT FALSE,
  -- Creator-submitted integrations sit in 'pending' until a SuperAdmin reviews.
  -- 'approved' | 'pending' | 'rejected'. System integrations skip straight to 'approved'.
  review_status   VARCHAR(16) NOT NULL DEFAULT 'approved',
  reviewed_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  rejection_reason TEXT,
  -- For creator-built integrations: which creator owns this row.
  owner_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS integrations_kind_enabled_idx
  ON integrations(kind, enabled);
CREATE INDEX IF NOT EXISTS integrations_category_idx
  ON integrations(category);
CREATE INDEX IF NOT EXISTS integrations_owner_idx
  ON integrations(owner_user_id);
CREATE INDEX IF NOT EXISTS integrations_review_status_idx
  ON integrations(review_status);

-- Per-integration secret storage (API keys). Keep a separate table so we
-- can rotate without touching the registry row, and so the `integrations`
-- row can be safely returned to the frontend without leaking secrets.
CREATE TABLE IF NOT EXISTS integration_credentials (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  -- Which env-var name the API expects (e.g. 'PDL_API_KEY'). The actual
  -- secret value is stored in Cloudflare env or a secrets manager and
  -- referenced by name; this row records WHICH key the integration uses.
  env_var_name   VARCHAR(128) NOT NULL,
  -- Optional secondary fields (e.g. account ID) — JSON map of name → env_var_name.
  extra          JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Last time SuperAdmin verified the credential resolves to a non-empty value.
  last_verified_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS integration_credentials_integration_idx
  ON integration_credentials(integration_id);

-- Run history. Append-only; observability for SuperAdmin and per-creator analytics.
CREATE TABLE IF NOT EXISTS integration_runs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  -- Who triggered the call (NULL = scheduled cron).
  user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  -- 'lookup' | 'ingest' | 'refresh' | 'cron'.
  kind           VARCHAR(16) NOT NULL,
  -- 'success' | 'cache_hit' | 'error' | 'no_credentials' | 'disabled' | 'suppressed'.
  status         VARCHAR(24) NOT NULL,
  -- Lookup input (email/url/handle). Hashed for emails to satisfy GDPR principles.
  query          JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Provider response (cleaned, never includes provider secrets).
  result         JSONB,
  cost_cents     INTEGER NOT NULL DEFAULT 0,
  cache_hit      BOOLEAN NOT NULL DEFAULT FALSE,
  error_message  TEXT,
  duration_ms    INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS integration_runs_integration_idx
  ON integration_runs(integration_id);
CREATE INDEX IF NOT EXISTS integration_runs_user_idx
  ON integration_runs(user_id);
CREATE INDEX IF NOT EXISTS integration_runs_created_idx
  ON integration_runs(created_at DESC);

-- ---------------------------------------------------------------------------
-- People — canonical merged identity (separate from the platform's `users`
-- table — these are sourced contacts, not registered users).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sourced_people (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Display fields. Authoritative copy is whichever provider has highest trust;
  -- per-source values are kept on `person_sources` for audit.
  full_name      VARCHAR(255),
  given_name     VARCHAR(128),
  family_name    VARCHAR(128),
  primary_email  VARCHAR(320),
  primary_email_hash VARCHAR(64),  -- SHA-256, used for indexed lookups while preserving privacy
  primary_linkedin_url VARCHAR(512),
  primary_github_login VARCHAR(128),
  current_title  VARCHAR(255),
  current_company VARCHAR(255),
  location       VARCHAR(255),
  country_code   VARCHAR(2),
  -- Source-of-record tracking: the integration whose data populated the canonical fields.
  primary_source_integration_id UUID REFERENCES integrations(id) ON DELETE SET NULL,
  -- Reconciliation with the platform `users` table. A sourced person can be
  -- matched and linked to a real user account via the SuperAdmin merge tool.
  -- Once linked, the sourced row is hidden from sourcing-pool browsing
  -- (recruiters see the user's real profile instead).
  linked_user_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  -- 'unclaimed' = no user signed up that matches; default state after import.
  -- 'pending_review' = automatic match suggested; SuperAdmin must merge or reject.
  -- 'merged' = linked_user_id is set + canonical record is the user's profile.
  -- 'rejected_match' = candidate was reviewed and rejected; row stays unclaimed.
  merge_status            VARCHAR(20) NOT NULL DEFAULT 'unclaimed',
  -- Suggested user when merge_status = 'pending_review'.
  merge_candidate_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  -- 0..100 confidence score from the reconciliation pass (3 identifier match = 100).
  merge_confidence        INTEGER,
  merge_detected_at       TIMESTAMPTZ,
  merge_resolved_at       TIMESTAMPTZ,
  merge_resolved_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  -- Soft-delete + suppression flags. Rows are NEVER hard-deleted in app code;
  -- DSR-erasure path replaces row content with NULL and sets these flags.
  is_redacted    BOOLEAN NOT NULL DEFAULT FALSE,
  redacted_at    TIMESTAMPTZ,
  redaction_reason VARCHAR(64),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sourced_people_email_hash_idx
  ON sourced_people(primary_email_hash);
CREATE INDEX IF NOT EXISTS sourced_people_linkedin_idx
  ON sourced_people(primary_linkedin_url);
CREATE INDEX IF NOT EXISTS sourced_people_github_idx
  ON sourced_people(primary_github_login);
CREATE INDEX IF NOT EXISTS sourced_people_linked_user_idx
  ON sourced_people(linked_user_id);
CREATE INDEX IF NOT EXISTS sourced_people_merge_status_idx
  ON sourced_people(merge_status);
CREATE INDEX IF NOT EXISTS sourced_people_merge_candidate_idx
  ON sourced_people(merge_candidate_user_id);

-- Reconciliation audit log — every merge / reject / detect event for this row.
-- Lets us undo a bad merge (admin sees full history) and explains why a row
-- was linked to a particular user.
CREATE TABLE IF NOT EXISTS sourced_person_merge_log (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id          UUID NOT NULL REFERENCES sourced_people(id) ON DELETE CASCADE,
  candidate_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  -- 'detected' | 'merged' | 'rejected' | 'unmerged' | 'auto_merged'
  action             VARCHAR(24) NOT NULL,
  confidence         INTEGER,
  matched_identifiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  performed_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sourced_person_merge_log_person_idx
  ON sourced_person_merge_log(person_id);
CREATE INDEX IF NOT EXISTS sourced_person_merge_log_user_idx
  ON sourced_person_merge_log(candidate_user_id);

-- Identifiers (one person → many of these). Drives unique-keyed lookups.
CREATE TABLE IF NOT EXISTS person_identifiers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id     UUID NOT NULL REFERENCES sourced_people(id) ON DELETE CASCADE,
  -- 'email' | 'email_hash' | 'linkedin_url' | 'github_login' | 'twitter_handle' | 'phone_e164'
  identifier_type VARCHAR(32) NOT NULL,
  identifier_value VARCHAR(512) NOT NULL,
  is_verified   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS person_identifiers_unique_idx
  ON person_identifiers(identifier_type, identifier_value);
CREATE INDEX IF NOT EXISTS person_identifiers_person_idx
  ON person_identifiers(person_id);

-- Provenance — every payload from every provider, keyed by integration_id.
CREATE TABLE IF NOT EXISTS person_sources (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id     UUID NOT NULL REFERENCES sourced_people(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- ISO-8601 expiry; resolver treats payload as stale and re-fetches after this.
  stale_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS person_sources_person_idx
  ON person_sources(person_id);
CREATE INDEX IF NOT EXISTS person_sources_integration_idx
  ON person_sources(integration_id);
CREATE INDEX IF NOT EXISTS person_sources_stale_idx
  ON person_sources(stale_at);

-- ---------------------------------------------------------------------------
-- Cache — the cache-first resolver hits this BEFORE deciding to spend credits.
-- Keyed by the input identifier the user supplied (email/url/handle); points to
-- the resulting person row. TTL is per integration_id so we can refresh
-- per-provider on different cadences.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS enrichment_cache (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Hash of the canonical query (e.g. SHA-256 of "email:foo@bar.com" lowercased).
  -- Used as the lookup key so we never store raw email addresses here.
  query_key      VARCHAR(64) NOT NULL,
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  person_id      UUID REFERENCES sourced_people(id) ON DELETE SET NULL,
  -- Verbatim provider payload — the resolver only re-uses this if not stale.
  payload        JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- TTL — when NULL, never expires (e.g. for free-tier dump records).
  expires_at     TIMESTAMPTZ,
  hits           INTEGER NOT NULL DEFAULT 0,
  last_hit_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS enrichment_cache_unique_idx
  ON enrichment_cache(query_key, integration_id);
CREATE INDEX IF NOT EXISTS enrichment_cache_expires_idx
  ON enrichment_cache(expires_at);

-- ---------------------------------------------------------------------------
-- GDPR / CCPA compliance
-- ---------------------------------------------------------------------------
-- Data subject requests: a person (subject) asks for access / erasure / etc.
-- Public submission, SuperAdmin processing.
CREATE TABLE IF NOT EXISTS data_subject_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'access' | 'erasure' | 'rectification' | 'portability' | 'objection' | 'opt_out'.
  request_type  VARCHAR(24) NOT NULL,
  subject_email VARCHAR(320) NOT NULL,
  subject_email_hash VARCHAR(64) NOT NULL,
  -- Optional secondary identifiers the requester provided.
  identifiers   JSONB NOT NULL DEFAULT '[]'::jsonb,
  jurisdiction  VARCHAR(32),  -- 'eu' | 'uk' | 'california' | 'other'
  notes         TEXT,
  -- 'pending' | 'verifying_identity' | 'in_progress' | 'completed' | 'rejected'.
  status        VARCHAR(32) NOT NULL DEFAULT 'pending',
  verification_token VARCHAR(64),         -- Magic-link token sent to subject_email
  verification_completed_at TIMESTAMPTZ,
  processed_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  processed_at  TIMESTAMPTZ,
  result_summary TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dsr_email_hash_idx
  ON data_subject_requests(subject_email_hash);
CREATE INDEX IF NOT EXISTS dsr_status_idx
  ON data_subject_requests(status);
CREATE INDEX IF NOT EXISTS dsr_created_idx
  ON data_subject_requests(created_at DESC);

-- Suppression list: identifiers that must NEVER be re-sourced or re-imported.
-- Populated by erasure DSRs and by users opting out via marketing channels.
CREATE TABLE IF NOT EXISTS data_suppression_list (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Mirror person_identifiers.identifier_type, plus 'domain' for blanket blocks.
  identifier_type VARCHAR(32) NOT NULL,
  identifier_value VARCHAR(512) NOT NULL,
  identifier_hash VARCHAR(64),   -- SHA-256 for emails to keep raw value off the index
  -- 'erasure_request' | 'user_opt_out' | 'admin_action' | 'bounce' | 'spam_complaint'.
  reason          VARCHAR(32) NOT NULL,
  source_dsr_id   UUID REFERENCES data_subject_requests(id) ON DELETE SET NULL,
  added_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS suppression_unique_idx
  ON data_suppression_list(identifier_type, identifier_value);
CREATE INDEX IF NOT EXISTS suppression_hash_idx
  ON data_suppression_list(identifier_hash);

-- ---------------------------------------------------------------------------
-- Seed system integrations (idempotent; ON CONFLICT preserves admin overrides).
-- These ship disabled by default; SuperAdmin must enable + supply credentials
-- before any of them consume credits.
-- ---------------------------------------------------------------------------
INSERT INTO integrations (slug, display_name, kind, category, pricing_model, cost_per_call_cents, description, homepage_url, docs_url, capabilities, enabled, review_status)
VALUES
  ('peopledatalabs',
   'People Data Labs',
   'system', 'enrichment', 'paid', 20,
   '3B+ profile API. Person-enrich by email, LinkedIn URL, or name+company. Used as primary enrichment provider.',
   'https://www.peopledatalabs.com',
   'https://docs.peopledatalabs.com/docs/person-enrichment-api',
   '{"enrichByEmail":true,"enrichByLinkedIn":true,"enrichByName":true,"emailFinder":false}'::jsonb,
   FALSE, 'approved'),

  ('apollo',
   'Apollo.io',
   'system', 'enrichment', 'freemium', 10,
   '275M-contact B2B database with email finder and enrich endpoints. Strong for sales/recruiting overlap.',
   'https://www.apollo.io',
   'https://docs.apollo.io/reference/people-api',
   '{"enrichByEmail":true,"enrichByLinkedIn":true,"enrichByName":true,"emailFinder":true}'::jsonb,
   FALSE, 'approved'),

  ('proxycurl',
   'Proxycurl',
   'system', 'enrichment', 'paid', 4,
   'LinkedIn URL → profile. Cheapest fallback for LinkedIn-derived data.',
   'https://nubela.co/proxycurl',
   'https://nubela.co/proxycurl/docs',
   '{"enrichByEmail":false,"enrichByLinkedIn":true,"enrichByName":false,"emailFinder":false}'::jsonb,
   FALSE, 'approved'),

  ('hunter',
   'Hunter.io',
   'system', 'enrichment', 'freemium', 5,
   'Email-finder + verifier. Used for "find email by name + company" flows.',
   'https://hunter.io',
   'https://hunter.io/api-documentation/v2',
   '{"enrichByEmail":true,"enrichByLinkedIn":false,"enrichByName":true,"emailFinder":true}'::jsonb,
   FALSE, 'approved'),

  ('github',
   'GitHub',
   'system', 'sourcing', 'free', 0,
   'Public developer profiles via GitHub REST API. Free, rate-limited; auth token raises limit to 5K/hr.',
   'https://github.com',
   'https://docs.github.com/en/rest/users/users',
   '{"enrichByEmail":false,"enrichByLinkedIn":false,"enrichByName":false,"enrichByHandle":true,"emailFinder":false,"sourcingScrape":true}'::jsonb,
   TRUE, 'approved'),

  ('stackoverflow',
   'Stack Overflow Data Dump',
   'system', 'data_dump', 'free', 0,
   'Quarterly XML dump of public Stack Overflow profiles + tags. Bulk-import job, not per-call.',
   'https://archive.org/details/stackexchange',
   'https://archive.org/details/stackexchange',
   '{"bulkImport":true}'::jsonb,
   FALSE, 'approved'),

  ('wikidata',
   'Wikidata',
   'system', 'data_dump', 'free', 0,
   'Public-figure ingestion (executives, founders, board members). Free SPARQL/REST.',
   'https://www.wikidata.org',
   'https://www.wikidata.org/wiki/Wikidata:REST_API',
   '{"bulkImport":true,"enrichByName":true}'::jsonb,
   FALSE, 'approved'),

  ('commoncrawl',
   'Common Crawl',
   'system', 'data_dump', 'free', 0,
   'Petabytes of public web crawl data. Used for company "about/team" page extraction.',
   'https://commoncrawl.org',
   'https://commoncrawl.org/the-data/get-started',
   '{"bulkImport":true}'::jsonb,
   FALSE, 'approved'),

  ('opencorporates',
   'OpenCorporates',
   'system', 'sourcing', 'freemium', 0,
   'Officer/director public records across global jurisdictions. Free tier 200/mo.',
   'https://opencorporates.com',
   'https://api.opencorporates.com',
   '{"enrichByName":true,"sourcingScrape":true}'::jsonb,
   FALSE, 'approved')
ON CONFLICT (slug) DO NOTHING;
