-- Migration 0132 — Scorecards Greenhouse-parity foundations.
--
-- Closes gap-register entries #1380 (blind review), #1382 (cross-template
-- competency framework), #1383 (scorecard SLAs + reminders) and #1386
-- (take-home stage kind). All four touch the scorecards aggregate so they
-- land in a single migration to share the schema-edit window.

-- ---------------------------------------------------------------------------
-- #1382 — Cross-template competency framework.
-- ---------------------------------------------------------------------------
-- A `competency` is a reusable rubric primitive (e.g. "Technical Depth")
-- with leveled anchors L1..L7. Scorecard attributes can OPTIONALLY reference
-- a competency so two templates that both rate "Technical Depth" produce
-- comparable cross-role analytics. Free-form attributes (no competencyId)
-- continue to work unchanged.

CREATE TABLE IF NOT EXISTS competencies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES company_profiles(id) ON DELETE CASCADE,
  name        VARCHAR(200) NOT NULL,
  description TEXT,
  -- 'technical' | 'behavioral' | 'leadership' | 'execution' | 'other'
  taxonomy    VARCHAR(32) NOT NULL DEFAULT 'other',
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS competencies_company_idx ON competencies(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS competencies_company_name_unique
  ON competencies(company_id, lower(name))
  WHERE is_archived = FALSE;

-- Leveled anchors per competency. `level` is a small integer (1..7 default
-- but we don't constrain to allow customer-defined level ladders).
CREATE TABLE IF NOT EXISTS competency_levels (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competency_id  UUID NOT NULL REFERENCES competencies(id) ON DELETE CASCADE,
  level          INTEGER NOT NULL,
  label          VARCHAR(100) NOT NULL,
  anchor         TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS competency_levels_competency_idx
  ON competency_levels(competency_id);
CREATE UNIQUE INDEX IF NOT EXISTS competency_levels_unique
  ON competency_levels(competency_id, level);

-- Existing free-form attributes can opt into a competency. Nullable so the
-- migration is backward-compatible with every existing template.
ALTER TABLE scorecard_attributes
  ADD COLUMN IF NOT EXISTS competency_id UUID
    REFERENCES competencies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS scorecard_attributes_competency_idx
  ON scorecard_attributes(competency_id);

-- ---------------------------------------------------------------------------
-- #1380 — Blind / anonymous review mode (kit-level).
-- ---------------------------------------------------------------------------
-- Off by default. The submission route + DebriefView consult this flag to
-- decide what to mask. Stored on the kit because a single kit defines the
-- whole interview-loop policy.
ALTER TABLE interview_kits
  ADD COLUMN IF NOT EXISTS blind_review_mode VARCHAR(32) NOT NULL DEFAULT 'off';

-- 'off' | 'anonymize_candidate' | 'hide_peer_scorecards' | 'both'
-- Validated at the service / Zod layer; intentionally not a CHECK constraint
-- so new modes can land without a schema migration.

-- #1383 — escalation target for overdue submissions.
ALTER TABLE interview_kits
  ADD COLUMN IF NOT EXISTS escalate_to_user_id UUID
    REFERENCES users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- #1386 — Stage kind enum on interview_kit_stages.
-- ---------------------------------------------------------------------------
-- Existing stages are all 'interview' — the default keeps everything
-- backward-compatible. New kinds: 'async_video', 'take_home', 'assessment'.
ALTER TABLE interview_kit_stages
  ADD COLUMN IF NOT EXISTS stage_kind VARCHAR(32) NOT NULL DEFAULT 'interview';

-- ---------------------------------------------------------------------------
-- #1383 — Scorecard SLAs + reminder tracking.
-- ---------------------------------------------------------------------------
-- `due_at` is the soft deadline the evaluator commits to. The reminder
-- worker scans `WHERE status='draft' AND due_at < now() + interval '4 hours'
-- AND (reminded_at IS NULL OR reminded_at < due_at - interval '4 hours')`.
-- `reminded_at` is the most recent reminder timestamp; we don't store the
-- full history because every channel emits at most one nudge per cycle.
ALTER TABLE scorecard_submissions
  ADD COLUMN IF NOT EXISTS due_at      TIMESTAMPTZ;
ALTER TABLE scorecard_submissions
  ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMPTZ;
ALTER TABLE scorecard_submissions
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;

-- Worker-friendly index: scan only drafts approaching their deadline.
CREATE INDEX IF NOT EXISTS scorecard_submissions_sla_idx
  ON scorecard_submissions(due_at)
  WHERE status = 'draft' AND due_at IS NOT NULL;
