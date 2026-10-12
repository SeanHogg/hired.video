-- Integrity sweep from the data-model anti-pattern audit.
--
-- (a) Nullable composite uniques re-issued with partial WHERE clauses.
--     Postgres treats NULL as distinct in uniqueness; the bare unique
--     allows "many submissions per evaluator without an interviewId."
--
-- (b) `onDelete: restrict` softened to `set null` on template / plan FKs
--     that should not block deletion of the parent. The "audit row
--     survives parent purge" pattern that legal_document_acceptances
--     established in #1601 applies here too.

-- ---------------------------------------------------------------------------
-- (a) scorecard_submissions — interviewId is nullable, but the existing
--     uniqueIndex on (interview_id, evaluator_user_id) treats NULL as
--     distinct. Re-issue as partial WHERE interview_id IS NOT NULL so
--     the constraint enforces the intended one-per-interview-evaluator
--     while still allowing submissions without an interview binding.
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS scorecard_submissions_interview_evaluator_unique;

CREATE UNIQUE INDEX IF NOT EXISTS scorecard_submissions_interview_evaluator_unique
  ON scorecard_submissions (interview_id, evaluator_user_id)
  WHERE interview_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- (b) ON DELETE RESTRICT → SET NULL on template / plan FKs.
--     - subscriptions.plan_id: deprecating a tier is impossible if any
--       sub references it. SET NULL lets us archive a plan while keeping
--       the subscription audit trail.
--     - scorecard_submissions.template_id: same shape — submissions
--       outlive templates.
--     - calibration_sessions.template_id: same.
--     Each block drops the existing FK (idempotent) and re-adds with
--     the softened behavior.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  -- subscriptions.plan_id
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_plan_id_subscription_plans_id_fk') THEN
    ALTER TABLE subscriptions DROP CONSTRAINT subscriptions_plan_id_subscription_plans_id_fk;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_plan_id_fkey') THEN
    ALTER TABLE subscriptions
      ADD CONSTRAINT subscriptions_plan_id_fkey
      FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE SET NULL;
  END IF;

  -- subscriptions.plan_id needs to be nullable for SET NULL to fire.
  ALTER TABLE subscriptions ALTER COLUMN plan_id DROP NOT NULL;
END $$;

DO $$
BEGIN
  -- scorecard_submissions.template_id — check column exists first
  -- (some installs may have it as templateId differently named).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scorecard_submissions' AND column_name = 'template_id'
  ) THEN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scorecard_submissions_template_id_scorecard_templates_id_fk') THEN
      ALTER TABLE scorecard_submissions DROP CONSTRAINT scorecard_submissions_template_id_scorecard_templates_id_fk;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scorecard_submissions_template_id_fkey') THEN
      ALTER TABLE scorecard_submissions
        ADD CONSTRAINT scorecard_submissions_template_id_fkey
        FOREIGN KEY (template_id) REFERENCES scorecard_templates(id) ON DELETE SET NULL;
    END IF;
    EXECUTE 'ALTER TABLE scorecard_submissions ALTER COLUMN template_id DROP NOT NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calibration_sessions' AND column_name = 'template_id'
  ) THEN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calibration_sessions_template_id_scorecard_templates_id_fk') THEN
      ALTER TABLE calibration_sessions DROP CONSTRAINT calibration_sessions_template_id_scorecard_templates_id_fk;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calibration_sessions_template_id_fkey') THEN
      ALTER TABLE calibration_sessions
        ADD CONSTRAINT calibration_sessions_template_id_fkey
        FOREIGN KEY (template_id) REFERENCES scorecard_templates(id) ON DELETE SET NULL;
    END IF;
    EXECUTE 'ALTER TABLE calibration_sessions ALTER COLUMN template_id DROP NOT NULL';
  END IF;
END $$;
