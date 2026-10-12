-- Migration 0050 — Structured-hiring scorecards & interview kits.
--
-- Greenhouse-parity: every job has an interview KIT (named bundle of stages
-- + scorecard templates), every interview produces a SUBMISSION (one per
-- evaluator), every submission has RATINGS across the template's rating
-- ATTRIBUTES, and a final HIRING DECISION rolls all submissions for an
-- application up into approve / reject / hold / withdraw.

-- ---------------------------------------------------------------------------
-- Scorecard templates — reusable rubric per role / role family.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scorecard_templates (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES company_profiles(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name               VARCHAR(200) NOT NULL,
  description        TEXT,
  -- '1-4' | '1-5' | 'thumbs' | 'yes-no'
  rating_scale       VARCHAR(16) NOT NULL DEFAULT '1-4',
  role_family        VARCHAR(100),
  is_archived        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS scorecard_templates_company_idx
  ON scorecard_templates(company_id);

-- Rating attributes on a template.
CREATE TABLE IF NOT EXISTS scorecard_attributes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   UUID NOT NULL REFERENCES scorecard_templates(id) ON DELETE CASCADE,
  name          VARCHAR(200) NOT NULL,
  description   TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  weight        INTEGER NOT NULL DEFAULT 1,
  -- Optional anchor descriptions per rating value, e.g. {"1": "Below bar", "4": "Strong"}
  anchors       JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS scorecard_attributes_template_idx
  ON scorecard_attributes(template_id);

-- ---------------------------------------------------------------------------
-- Interview kits — named bundle of stages + scorecard templates per job.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS interview_kits (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES company_profiles(id) ON DELETE CASCADE,
  job_id             UUID REFERENCES job_items(id) ON DELETE SET NULL,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name               VARCHAR(200) NOT NULL,
  description        TEXT,
  is_archived        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS interview_kits_company_idx
  ON interview_kits(company_id);
CREATE INDEX IF NOT EXISTS interview_kits_job_idx
  ON interview_kits(job_id);

-- Stages within a kit.
CREATE TABLE IF NOT EXISTS interview_kit_stages (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_id                UUID NOT NULL REFERENCES interview_kits(id) ON DELETE CASCADE,
  name                  VARCHAR(200) NOT NULL,
  description           TEXT,
  display_order         INTEGER NOT NULL DEFAULT 0,
  duration_minutes      INTEGER DEFAULT 60,
  suggested_questions   JSONB,
  scorecard_template_id UUID REFERENCES scorecard_templates(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS interview_kit_stages_kit_idx
  ON interview_kit_stages(kit_id);

-- ---------------------------------------------------------------------------
-- Scorecard submissions — one per evaluator per interview.
-- ---------------------------------------------------------------------------
--
-- application_id is intentionally TEXT (not FK) — the application pipeline
-- is polymorphic across multiple sources (job_applications, sourcing,
-- talent pool). Routes validate existence at write time.
CREATE TABLE IF NOT EXISTS scorecard_submissions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id              UUID NOT NULL REFERENCES scorecard_templates(id) ON DELETE RESTRICT,
  interview_id             UUID REFERENCES interviews(id) ON DELETE SET NULL,
  kit_stage_id             UUID REFERENCES interview_kit_stages(id) ON DELETE SET NULL,
  application_id           TEXT NOT NULL,
  candidate_user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  evaluator_user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 'strong_yes' | 'yes' | 'no' | 'strong_no'
  overall_recommendation   VARCHAR(24),
  -- weighted mean of per-attribute ratings, computed at submit time
  overall_score            INTEGER,
  summary                  TEXT,
  strengths                TEXT,
  concerns                 TEXT,
  -- 'draft' | 'submitted'
  status                   VARCHAR(16) NOT NULL DEFAULT 'draft',
  submitted_at             TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS scorecard_submissions_application_idx
  ON scorecard_submissions(application_id);
CREATE INDEX IF NOT EXISTS scorecard_submissions_evaluator_idx
  ON scorecard_submissions(evaluator_user_id);
CREATE INDEX IF NOT EXISTS scorecard_submissions_interview_idx
  ON scorecard_submissions(interview_id);

-- One submission per (interview, evaluator) — rerunning replaces the row.
CREATE UNIQUE INDEX IF NOT EXISTS scorecard_submissions_interview_evaluator_unique
  ON scorecard_submissions(interview_id, evaluator_user_id)
  WHERE interview_id IS NOT NULL;

-- Per-attribute ratings inside a submission.
CREATE TABLE IF NOT EXISTS scorecard_submission_ratings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES scorecard_submissions(id) ON DELETE CASCADE,
  attribute_id  UUID NOT NULL REFERENCES scorecard_attributes(id) ON DELETE CASCADE,
  rating        INTEGER,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS scorecard_submission_ratings_submission_attribute_unique
  ON scorecard_submission_ratings(submission_id, attribute_id);

-- ---------------------------------------------------------------------------
-- Hiring decisions — final roll-up per (application, job).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hiring_decisions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES company_profiles(id) ON DELETE CASCADE,
  job_id              UUID REFERENCES job_items(id) ON DELETE SET NULL,
  application_id      TEXT NOT NULL,
  candidate_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_by_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 'approve' | 'reject' | 'hold' | 'withdraw'
  decision            VARCHAR(16) NOT NULL,
  reason              TEXT,
  aggregate_snapshot  JSONB,
  decided_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hiring_decisions_application_idx
  ON hiring_decisions(application_id);
CREATE INDEX IF NOT EXISTS hiring_decisions_company_idx
  ON hiring_decisions(company_id);
