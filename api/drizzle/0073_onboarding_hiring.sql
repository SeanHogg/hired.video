-- Migration 0073 — Hiring & Onboarding tables backing /services/hiring
-- (offer letters + onboarding checklists). Schema lives in
-- src/db/schema/onboarding.ts; routes in src/routes/onboarding-hiring.ts.
--
-- Idempotent (IF NOT EXISTS) so re-running after a partial rollout is safe.

-- ---------------------------------------------------------------------------
-- offer_letters — drafts, sent offers, e-sign artifacts.
-- status values: draft | sent | viewed | accepted | declined | expired | signed
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS offer_letters (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  candidate_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  candidate_name       VARCHAR(255) NOT NULL,
  candidate_email      VARCHAR(255) NOT NULL,
  job_title            VARCHAR(255) NOT NULL,
  company_name         VARCHAR(255) NOT NULL,
  salary               NUMERIC,
  currency             VARCHAR(10) DEFAULT 'USD',
  start_date           TIMESTAMPTZ,
  expires_at           TIMESTAMPTZ,
  body_html            TEXT NOT NULL,
  status               VARCHAR(50) NOT NULL DEFAULT 'draft',
  signed_at            TIMESTAMPTZ,
  signature_data       TEXT,
  decline_reason       TEXT,
  metadata             JSONB DEFAULT '{}'::jsonb,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS offer_letters_created_by_idx
  ON offer_letters(created_by_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS offer_letters_candidate_idx
  ON offer_letters(candidate_user_id);

-- ---------------------------------------------------------------------------
-- onboarding_checklists — assigned to a new hire, optionally tied to an offer.
-- status values: pending | in_progress | completed
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS onboarding_checklists (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by_user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  candidate_user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  offer_letter_id        UUID REFERENCES offer_letters(id) ON DELETE SET NULL,
  candidate_name         VARCHAR(255) NOT NULL,
  job_title              VARCHAR(255),
  start_date             TIMESTAMPTZ,
  status                 VARCHAR(50) NOT NULL DEFAULT 'pending',
  completion_percentage  NUMERIC DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS onboarding_checklists_created_by_idx
  ON onboarding_checklists(created_by_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS onboarding_checklists_candidate_idx
  ON onboarding_checklists(candidate_user_id);

-- ---------------------------------------------------------------------------
-- onboarding_tasks — individual checklist items.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS onboarding_tasks (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id           UUID NOT NULL REFERENCES onboarding_checklists(id) ON DELETE CASCADE,
  title                  VARCHAR(255) NOT NULL,
  description            TEXT,
  category               VARCHAR(100) DEFAULT 'general',
  due_date               TIMESTAMPTZ,
  is_completed           BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at           TIMESTAMPTZ,
  completed_by_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  sort_order             NUMERIC DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS onboarding_tasks_checklist_idx
  ON onboarding_tasks(checklist_id, sort_order);
