-- Migration 0135 — Take-home assignments + question-competency tagging
-- (#1386 + #1390).

-- ---------------------------------------------------------------------------
-- #1386 — Take-home assignment stage.
-- ---------------------------------------------------------------------------
-- Lifted on top of `interview_kit_stages.stage_kind = 'take_home'`.
-- One assignment row per kit stage; one submission row per
-- (assignment, candidate). Evaluators score the submission through the
-- existing `scorecard_submissions` flow — `take_home_submissions`
-- carries a nullable FK to the evaluator's scorecard submission so the
-- whole loop runs through one rubric.

CREATE TABLE IF NOT EXISTS take_home_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_stage_id    UUID NOT NULL REFERENCES interview_kit_stages(id) ON DELETE CASCADE,
  prompt          TEXT NOT NULL,
  -- 'github_url' | 'file_upload' | 'code_paste' | 'doc_link'
  delivery_format VARCHAR(32) NOT NULL DEFAULT 'github_url',
  due_in_hours    INTEGER NOT NULL DEFAULT 72,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS take_home_assignments_kit_stage_idx
  ON take_home_assignments(kit_stage_id);

CREATE TABLE IF NOT EXISTS take_home_submissions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id     UUID NOT NULL REFERENCES take_home_assignments(id) ON DELETE CASCADE,
  application_id    TEXT NOT NULL,
  candidate_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  delivery_url      TEXT,
  -- Optional file refs (R2 keys) when delivery_format='file_upload'.
  file_refs         JSONB NOT NULL DEFAULT '[]'::jsonb,
  text_response     TEXT,
  -- Magic-link token + expiry for the candidate-facing surface.
  invite_token      VARCHAR(64) UNIQUE,
  token_expires_at  TIMESTAMPTZ,
  submitted_at      TIMESTAMPTZ,
  -- Linked scorecard submission once a reviewer scores it (#1386(e)).
  evaluator_scorecard_submission_id UUID
    REFERENCES scorecard_submissions(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS take_home_submissions_assignment_idx
  ON take_home_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS take_home_submissions_application_idx
  ON take_home_submissions(application_id);

-- ---------------------------------------------------------------------------
-- #1390 — Question → competency tagging.
-- ---------------------------------------------------------------------------
-- `interview_kit_stages.suggested_questions` is JSONB today (an array of
-- strings). Question→competency tagging needs a stable id + competency
-- FK per question. We promote the question list into a relational table
-- linked to the stage. The legacy JSONB column stays in place for now
-- so existing stages keep rendering; new questions go through the new
-- table.

CREATE TABLE IF NOT EXISTS interview_stage_questions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_stage_id     UUID NOT NULL REFERENCES interview_kit_stages(id) ON DELETE CASCADE,
  competency_id    UUID REFERENCES competencies(id) ON DELETE SET NULL,
  prompt           TEXT NOT NULL,
  -- 'L1'..'L7' (or any short marker — kept as a string so customers can
  -- use their own level labels).
  difficulty       VARCHAR(8),
  -- 'star' | 'technical' | 'coding' | 'portfolio' | 'open'
  expected_answer  VARCHAR(16) NOT NULL DEFAULT 'open',
  display_order    INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS interview_stage_questions_stage_idx
  ON interview_stage_questions(kit_stage_id);
CREATE INDEX IF NOT EXISTS interview_stage_questions_competency_idx
  ON interview_stage_questions(competency_id);
