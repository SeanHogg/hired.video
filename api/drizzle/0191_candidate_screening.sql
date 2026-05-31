-- Migration 0191 — Candidate screening templates + magic-link screening requests.
--
-- A recruiter/employer authors a reusable per-role checklist (screening_templates
-- + screening_template_items); sending it to a candidate snapshots the items onto
-- a screening_request (+ screening_request_items) and mints a magic-link token.
-- The candidate completes outstanding items in the public portal; items already
-- satisfied from their pitch book are pre-marked at creation.
--
-- See api/src/db/schema/screening.ts and shared/screening.ts. The CHECK value
-- lists are the SQL mirror of the shared registries (SCREENING_ITEM_TYPES,
-- SCREENING_REQUEST_STATUSES, SCREENING_ITEM_STATUSES, SCREENING_SATISFIED_SOURCES)
-- — keep them in lockstep.
--
-- Idempotent per drizzle/TEMPLATE.md: new tables use CREATE TABLE IF NOT EXISTS
-- with inline CHECKs (NOT VALID is only required for constraints added to
-- pre-existing tables), indexes use IF NOT EXISTS.

-- ── screening_templates ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS screening_templates (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES company_profiles(id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name               VARCHAR(255) NOT NULL,
  description        TEXT,
  role_family        VARCHAR(120),
  job_id             UUID REFERENCES job_items(id) ON DELETE SET NULL,
  archived_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS screening_templates_company_idx ON screening_templates (company_id);
CREATE INDEX IF NOT EXISTS screening_templates_job_idx ON screening_templates (job_id);

-- ── screening_template_items ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS screening_template_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   UUID NOT NULL REFERENCES screening_templates(id) ON DELETE CASCADE,
  item_type     VARCHAR(32) NOT NULL
                  CHECK (item_type IN (
                    'resume', 'contact_info', 'predictive_assessment',
                    'competency_test', 'video_interview', 'references',
                    'tool_run', 'application_questions')),
  ref_id        UUID,
  config        JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_required   BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS screening_template_items_template_idx ON screening_template_items (template_id);

-- ── screening_requests ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS screening_requests (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES company_profiles(id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  template_id        UUID REFERENCES screening_templates(id) ON DELETE SET NULL,
  job_id             UUID REFERENCES job_items(id) ON DELETE SET NULL,
  application_id     UUID REFERENCES job_applications(id) ON DELETE SET NULL,
  candidate_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  candidate_email    VARCHAR(255) NOT NULL,
  candidate_name     VARCHAR(255),
  token              VARCHAR(64) NOT NULL UNIQUE,
  token_expires_at   TIMESTAMPTZ NOT NULL,
  status             VARCHAR(16) NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'in_progress', 'completed', 'expired')),
  message            TEXT,
  completed_at       TIMESTAMPTZ,
  last_sent_at       TIMESTAMPTZ,
  resend_count       INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS screening_requests_company_idx ON screening_requests (company_id);
CREATE INDEX IF NOT EXISTS screening_requests_token_idx ON screening_requests (token);
CREATE INDEX IF NOT EXISTS screening_requests_candidate_email_idx ON screening_requests (candidate_email);
CREATE INDEX IF NOT EXISTS screening_requests_application_idx ON screening_requests (application_id);

-- ── screening_request_items ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS screening_request_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id       UUID NOT NULL REFERENCES screening_requests(id) ON DELETE CASCADE,
  item_type        VARCHAR(32) NOT NULL
                     CHECK (item_type IN (
                       'resume', 'contact_info', 'predictive_assessment',
                       'competency_test', 'video_interview', 'references',
                       'tool_run', 'application_questions')),
  ref_id           UUID,
  config           JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_required      BOOLEAN NOT NULL DEFAULT true,
  display_order    INTEGER NOT NULL DEFAULT 0,
  status           VARCHAR(16) NOT NULL DEFAULT 'outstanding'
                     CHECK (status IN ('outstanding', 'satisfied', 'skipped')),
  satisfied_source VARCHAR(16)
                     CHECK (satisfied_source IS NULL OR satisfied_source IN ('pre_existing', 'completed_now')),
  result_ref       JSONB,
  satisfied_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS screening_request_items_request_idx ON screening_request_items (request_id);
