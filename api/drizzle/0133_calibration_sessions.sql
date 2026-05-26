-- Migration 0133 — Calibration sessions (#1381).
--
-- Calibration is the Greenhouse/Lever pattern where 3-6 interviewers
-- re-score a set of past candidates blind, and the system reveals
-- per-attribute deltas vs. the original cohort + the actual hire
-- decision. Used to onboard new interviewers and keep the bar
-- aligned quarterly.
--
-- Two new tables — sessions + per-evaluator calibration submissions.
-- Calibration submissions deliberately mirror `scorecard_submissions`
-- in shape but live in a separate table so calibration scores never
-- pollute real hiring data.

CREATE TABLE IF NOT EXISTS calibration_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES company_profiles(id) ON DELETE CASCADE,
  organizer_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id   UUID NOT NULL REFERENCES scorecard_templates(id) ON DELETE RESTRICT,
  name          VARCHAR(200) NOT NULL,
  description   TEXT,
  -- 'open' (accepting submissions) | 'closed' (revealing deltas) | 'archived'
  status        VARCHAR(16) NOT NULL DEFAULT 'open',
  -- Subject candidates the session re-scores (JSON array of opaque
  -- application IDs — same polymorphic identifier shape as
  -- scorecard_submissions.application_id).
  candidate_application_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  closed_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS calibration_sessions_company_idx
  ON calibration_sessions(company_id);
CREATE INDEX IF NOT EXISTS calibration_sessions_organizer_idx
  ON calibration_sessions(organizer_id);

-- Per-evaluator calibration submissions. Mirrors scorecard_submissions
-- without the live-hiring linkage so calibration scores never end up in
-- a debrief by accident.
CREATE TABLE IF NOT EXISTS calibration_submissions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID NOT NULL REFERENCES calibration_sessions(id) ON DELETE CASCADE,
  evaluator_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id TEXT NOT NULL,
  overall_recommendation VARCHAR(24),
  overall_score  INTEGER,
  -- attribute_id -> rating (matches the template's attribute scale)
  ratings        JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes          TEXT,
  submitted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS calibration_submissions_session_idx
  ON calibration_submissions(session_id);
CREATE INDEX IF NOT EXISTS calibration_submissions_evaluator_idx
  ON calibration_submissions(evaluator_user_id);
-- Each evaluator submits at most one calibration scorecard per
-- (session, application) — re-submitting overwrites.
CREATE UNIQUE INDEX IF NOT EXISTS calibration_submissions_unique
  ON calibration_submissions(session_id, evaluator_user_id, application_id);
