-- Migration: 0119_predictive_assessments
--
-- Persisted assessment runs for the Predictive Assessments tool — the
-- HireVue/PI parity surface. One row per (user, kind, attempt). Free-tier
-- kinds (big_five, cognitive_sample) can be re-taken without limit; Pro
-- kinds (situational_judgment, EQ, DISC, resume_predictive_match)
-- require an active Pro subscription at run-start, recorded on the row
-- so we can audit later if a subscription downgrade happens mid-run.
--
-- Status lifecycle:
--   started      → run created, no responses yet
--   in_progress  → at least one response recorded
--   completed    → all questions answered + scores computed
--   abandoned    → soft-flag for runs older than 7 days with no completion
--                  (a future worker can sweep these; the route layer
--                  ignores abandoned rows from "active" listings)
--
-- responses + scores are jsonb because the per-kind question structure
-- varies (Likert vs multiple choice vs forced-choice pair). The shared
-- descriptors in shared/assessments/kinds.ts + question-banks.ts are the
-- source of truth for the keys; this table doesn't enforce them so a new
-- assessment kind doesn't need a migration.

CREATE TABLE IF NOT EXISTS assessment_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  assessment_kind varchar(64) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'started',

  -- Last answered question index (0-based) so a paused run can be resumed
  -- to the right place without re-asking already-answered questions.
  question_index integer NOT NULL DEFAULT 0,

  -- Array of { questionId: string, value: string|number }
  responses jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- { scores: Record<dim, 0..1>, counts: Record<dim, int>, overall: 0..1 }
  scores jsonb,

  -- Free-form narrative + role-fit summary the results page renders.
  results jsonb,

  -- Whether the user's subscription was Pro at run-start. Pro kinds set
  -- this to true; free kinds leave it false. Lets us audit a downgrade
  -- without losing completed results from when the user was paid.
  is_pro_run boolean NOT NULL DEFAULT false,

  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- History list query: most-recent-first per user.
CREATE INDEX IF NOT EXISTS idx_assessment_runs_user_created
  ON assessment_runs (user_id, created_at DESC);

-- Per-kind history filter (used by the results page "your last 5 of this
-- kind" sidebar and by the resume_predictive_match comparator).
CREATE INDEX IF NOT EXISTS idx_assessment_runs_user_kind
  ON assessment_runs (user_id, assessment_kind, completed_at DESC);

-- Active-run lookup: a single user shouldn't have two in-progress runs of
-- the same kind. Partial unique index enforces this only on non-terminal
-- states so historical completed runs don't block a new attempt.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_assessment_runs_user_kind_active
  ON assessment_runs (user_id, assessment_kind)
  WHERE status IN ('started', 'in_progress');
