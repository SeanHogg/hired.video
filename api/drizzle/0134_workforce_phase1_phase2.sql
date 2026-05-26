-- Migration 0134 — Workforce / agency back-office Phase 1+2.
--
-- Closes #1349 Phases 1 and 2: time-entry capture (employee punches in/out
-- against tasks) + timesheet weekly submission envelope + employer-side
-- approval audit trail.
--
-- The audit-touchpoints table is a per-aggregate copy of the
-- pipelineTouchpoints pattern; it will be migrated to the shared
-- audit_touchpoints backbone when #1404 lands.

-- ---------------------------------------------------------------------------
-- Phase 1 — task_time_entries
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS task_time_entries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      UUID REFERENCES tasks(id) ON DELETE SET NULL,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id   UUID NOT NULL REFERENCES company_profiles(id) ON DELETE CASCADE,
  started_at   TIMESTAMPTZ NOT NULL,
  ended_at     TIMESTAMPTZ,
  duration_sec INTEGER,
  billable     BOOLEAN NOT NULL DEFAULT TRUE,
  notes        TEXT,
  status       VARCHAR(16) NOT NULL DEFAULT 'open',
  timesheet_id UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_entries_user_started
  ON task_time_entries (user_id, started_at);
CREATE INDEX IF NOT EXISTS idx_time_entries_company_started
  ON task_time_entries (company_id, started_at);
CREATE INDEX IF NOT EXISTS idx_time_entries_timesheet
  ON task_time_entries (timesheet_id);
-- Partial index: only stores rows that are actually punched-in,
-- so the "find the open entry for user X" lookup is O(1) regardless
-- of historical entry volume.
CREATE INDEX IF NOT EXISTS idx_time_entries_active
  ON task_time_entries (user_id)
  WHERE ended_at IS NULL;

-- ---------------------------------------------------------------------------
-- Phase 2 — timesheets
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS timesheets (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id           UUID NOT NULL REFERENCES company_profiles(id) ON DELETE CASCADE,
  period_start         DATE NOT NULL,
  period_end           DATE NOT NULL,
  status               VARCHAR(16) NOT NULL DEFAULT 'draft',
  submitted_at         TIMESTAMPTZ,
  approved_at          TIMESTAMPTZ,
  approver_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  rejection_reason     TEXT,
  total_hours          NUMERIC(7,2),
  total_billable_hours NUMERIC(7,2),
  snapshot             JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Re-submission of a rejected week reuses the existing row (status back to
-- 'submitted'); the uniqueness invariant on (user, company, periodStart)
-- prevents duplicate envelopes for the same week.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_timesheet_user_company_period
  ON timesheets (user_id, company_id, period_start);
CREATE INDEX IF NOT EXISTS idx_timesheets_company_status
  ON timesheets (company_id, status);
CREATE INDEX IF NOT EXISTS idx_timesheets_user_status
  ON timesheets (user_id, status);

-- Wire the back-reference now that the parent exists. Cascading SET NULL
-- on timesheet delete: a destroyed timesheet doesn't take its entries
-- with it (rare edge — only an admin can hard-delete).
-- IF NOT EXISTS on ADD CONSTRAINT isn't standard, so guard with a DO block.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'task_time_entries_timesheet_fk'
  ) THEN
    ALTER TABLE task_time_entries
      ADD CONSTRAINT task_time_entries_timesheet_fk
      FOREIGN KEY (timesheet_id) REFERENCES timesheets(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Phase 2 — timesheet_touchpoints (audit trail; moves to shared
-- audit_touchpoints once #1404 lands)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS timesheet_touchpoints (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timesheet_id           UUID NOT NULL REFERENCES timesheets(id) ON DELETE CASCADE,
  type                   VARCHAR(32) NOT NULL,
  payload                JSONB DEFAULT '{}'::jsonb,
  performed_by_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_timesheet_touchpoints_ts_created
  ON timesheet_touchpoints (timesheet_id, created_at);
