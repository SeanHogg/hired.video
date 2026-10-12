-- Migration 0189 — People Operations remaining surfaces (PO-3, PO-5..PO-11, TA-4..6).
-- All segment-scoped; sub-collections are JSONB. Idempotent per TEMPLATE.md.

-- ── Strategic Objectives & Milestones (PO-5) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS people_strategic_objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES people_tenants(id) ON DELETE CASCADE,
  segment_id UUID NOT NULL REFERENCES people_segments(id) ON DELETE CASCADE,
  title VARCHAR(300) NOT NULL,
  description TEXT,
  category VARCHAR(24) NOT NULL DEFAULT 'strategic',
  timeframe VARCHAR(16) NOT NULL DEFAULT 'quarterly',
  start_date TIMESTAMPTZ, end_date TIMESTAMPTZ,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  priority INTEGER NOT NULL DEFAULT 1,
  owner_id UUID,
  progress INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_people_objectives_status ON people_strategic_objectives (tenant_id, segment_id, status);

CREATE TABLE IF NOT EXISTS people_objective_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES people_tenants(id) ON DELETE CASCADE,
  segment_id UUID NOT NULL REFERENCES people_segments(id) ON DELETE CASCADE,
  objective_id UUID NOT NULL REFERENCES people_strategic_objectives(id) ON DELETE CASCADE,
  title VARCHAR(300) NOT NULL,
  description TEXT,
  target_value DOUBLE PRECISION, current_value DOUBLE PRECISION, unit VARCHAR(40),
  status VARCHAR(16) NOT NULL DEFAULT 'not_started',
  due_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_people_outcomes_objective ON people_objective_outcomes (tenant_id, segment_id, objective_id);

CREATE TABLE IF NOT EXISTS people_objective_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES people_tenants(id) ON DELETE CASCADE,
  segment_id UUID NOT NULL REFERENCES people_segments(id) ON DELETE CASCADE,
  objective_id UUID NOT NULL REFERENCES people_strategic_objectives(id) ON DELETE CASCADE,
  title VARCHAR(300) NOT NULL,
  description TEXT,
  due_date TIMESTAMPTZ,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_people_obj_milestones_objective ON people_objective_milestones (tenant_id, segment_id, objective_id);

CREATE TABLE IF NOT EXISTS people_company_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES people_tenants(id) ON DELETE CASCADE,
  segment_id UUID NOT NULL REFERENCES people_segments(id) ON DELETE CASCADE,
  objective_id UUID,
  title VARCHAR(300) NOT NULL,
  description TEXT,
  category VARCHAR(24) NOT NULL DEFAULT 'product',
  target_date TIMESTAMPTZ, completed_date TIMESTAMPTZ,
  status VARCHAR(16) NOT NULL DEFAULT 'not_started',
  priority VARCHAR(16) NOT NULL DEFAULT 'medium',
  progress INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_people_company_milestones_status ON people_company_milestones (tenant_id, segment_id, status);

-- ── Performance Reviews (PO-3) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS people_performance_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES people_tenants(id) ON DELETE CASCADE,
  segment_id UUID NOT NULL REFERENCES people_segments(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES people_employees(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES people_employees(id) ON DELETE SET NULL,
  review_type VARCHAR(16) NOT NULL DEFAULT 'quarterly',
  status VARCHAR(16) NOT NULL DEFAULT 'scheduled',
  scheduled_date TIMESTAMPTZ, completed_date TIMESTAMPTZ,
  period_label VARCHAR(60),
  rating DOUBLE PRECISION,
  strengths TEXT, areas_for_improvement TEXT, comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_people_reviews_employee ON people_performance_reviews (tenant_id, segment_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_people_reviews_status ON people_performance_reviews (tenant_id, segment_id, status);

-- ── Pulse Checks (PO-6) ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS people_pulse_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES people_tenants(id) ON DELETE CASCADE,
  segment_id UUID NOT NULL REFERENCES people_segments(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  frequency VARCHAR(16) NOT NULL DEFAULT 'weekly',
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_people_pulse_active ON people_pulse_checks (tenant_id, segment_id, is_active);

CREATE TABLE IF NOT EXISTS people_pulse_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES people_tenants(id) ON DELETE CASCADE,
  segment_id UUID NOT NULL REFERENCES people_segments(id) ON DELETE CASCADE,
  pulse_check_id UUID NOT NULL REFERENCES people_pulse_checks(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES people_employees(id) ON DELETE SET NULL,
  responses JSONB NOT NULL DEFAULT '{}'::jsonb,
  sentiment DOUBLE PRECISION,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_people_pulse_responses_check ON people_pulse_responses (tenant_id, segment_id, pulse_check_id);

-- ── Scheduled Check-ins (PO-6) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS people_scheduled_check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES people_tenants(id) ON DELETE CASCADE,
  segment_id UUID NOT NULL REFERENCES people_segments(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  frequency VARCHAR(16) NOT NULL DEFAULT 'weekly',
  day_of_week INTEGER,
  time VARCHAR(8) NOT NULL DEFAULT '09:00',
  timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sent_at TIMESTAMPTZ, next_scheduled_at TIMESTAMPTZ,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_people_checkins_due ON people_scheduled_check_ins (tenant_id, segment_id, is_active, next_scheduled_at);

CREATE TABLE IF NOT EXISTS people_check_in_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES people_tenants(id) ON DELETE CASCADE,
  segment_id UUID NOT NULL REFERENCES people_segments(id) ON DELETE CASCADE,
  check_in_id UUID NOT NULL REFERENCES people_scheduled_check_ins(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES people_employees(id) ON DELETE SET NULL,
  responses JSONB NOT NULL DEFAULT '{}'::jsonb,
  sentiment DOUBLE PRECISION,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_people_checkin_responses_checkin ON people_check_in_responses (tenant_id, segment_id, check_in_id);

-- ── Weekly Syncs (PO-7) ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS people_weekly_syncs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES people_tenants(id) ON DELETE CASCADE,
  segment_id UUID NOT NULL REFERENCES people_segments(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  scheduled_date TIMESTAMPTZ NOT NULL,
  duration INTEGER NOT NULL DEFAULT 60,
  status VARCHAR(16) NOT NULL DEFAULT 'scheduled',
  meeting_link TEXT,
  agenda JSONB NOT NULL DEFAULT '[]'::jsonb,
  metrics JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_people_syncs_date ON people_weekly_syncs (tenant_id, segment_id, scheduled_date);

-- ── Team-metric Scorecards (PO-7) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS people_scorecards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES people_tenants(id) ON DELETE CASCADE,
  segment_id UUID NOT NULL REFERENCES people_segments(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  category VARCHAR(16) NOT NULL DEFAULT 'kpi',
  metrics JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_people_scorecards_category ON people_scorecards (tenant_id, segment_id, category);

CREATE TABLE IF NOT EXISTS people_scorecard_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES people_tenants(id) ON DELETE CASCADE,
  segment_id UUID NOT NULL REFERENCES people_segments(id) ON DELETE CASCADE,
  scorecard_id UUID NOT NULL REFERENCES people_scorecards(id) ON DELETE CASCADE,
  period TIMESTAMPTZ NOT NULL,
  values JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_people_scorecard_snapshots ON people_scorecard_snapshots (tenant_id, segment_id, scorecard_id, period);

-- ── Meeting Intelligence (PO-9) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS people_meeting_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES people_tenants(id) ON DELETE CASCADE,
  segment_id UUID NOT NULL REFERENCES people_segments(id) ON DELETE CASCADE,
  title VARCHAR(300) NOT NULL,
  meeting_type VARCHAR(24) NOT NULL DEFAULT 'meeting',
  transcript TEXT NOT NULL,
  summary TEXT,
  key_points JSONB, action_items JSONB, decisions JSONB,
  participants JSONB NOT NULL DEFAULT '[]'::jsonb,
  duration INTEGER,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_people_transcripts_recorded ON people_meeting_transcripts (tenant_id, segment_id, recorded_at);

-- ── Workflow Automation (PO-10) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS people_workflow_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES people_tenants(id) ON DELETE CASCADE,
  segment_id UUID NOT NULL REFERENCES people_segments(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  trigger_type VARCHAR(16) NOT NULL DEFAULT 'manual',
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_people_workflow_triggers_active ON people_workflow_triggers (tenant_id, segment_id, is_active);

CREATE TABLE IF NOT EXISTS people_workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES people_tenants(id) ON DELETE CASCADE,
  segment_id UUID NOT NULL REFERENCES people_segments(id) ON DELETE CASCADE,
  trigger_id UUID NOT NULL REFERENCES people_workflow_triggers(id) ON DELETE CASCADE,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  results JSONB,
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_people_workflow_exec_trigger ON people_workflow_executions (tenant_id, segment_id, trigger_id, started_at);

-- ── TCO settings (TA-4) ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS people_tco_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES people_tenants(id) ON DELETE CASCADE,
  segment_id UUID NOT NULL REFERENCES people_segments(id) ON DELETE CASCADE,
  payroll_taxes_pct DOUBLE PRECISION NOT NULL DEFAULT 0.08,
  benefits_pct DOUBLE PRECISION NOT NULL DEFAULT 0.25,
  perks_pct DOUBLE PRECISION NOT NULL DEFAULT 0.07,
  overhead_pct DOUBLE PRECISION NOT NULL DEFAULT 0.07,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_people_tco_segment ON people_tco_settings (tenant_id, segment_id);

-- ── Headcount Planning (TA-5) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS people_role_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES people_tenants(id) ON DELETE CASCADE,
  segment_id UUID NOT NULL REFERENCES people_segments(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  department VARCHAR(120) NOT NULL DEFAULT '',
  level VARCHAR(60),
  base_salary_cents BIGINT NOT NULL DEFAULT 0,
  equity_shares INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_people_roles_active ON people_role_definitions (tenant_id, segment_id, is_active);

CREATE TABLE IF NOT EXISTS people_headcount_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES people_tenants(id) ON DELETE CASCADE,
  segment_id UUID NOT NULL REFERENCES people_segments(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  start_date TIMESTAMPTZ, end_date TIMESTAMPTZ,
  fiscal_year VARCHAR(12),
  total_headcount INTEGER NOT NULL DEFAULT 0,
  total_cost_cents BIGINT NOT NULL DEFAULT 0,
  department_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  planned_hires JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(16) NOT NULL DEFAULT 'draft',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_people_headcount_status ON people_headcount_plans (tenant_id, segment_id, status);

-- ── PTO (TA-6) ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS people_pto_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES people_tenants(id) ON DELETE CASCADE,
  segment_id UUID NOT NULL REFERENCES people_segments(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES people_employees(id) ON DELETE CASCADE,
  type VARCHAR(16) NOT NULL DEFAULT 'vacation',
  start_date TIMESTAMPTZ NOT NULL, end_date TIMESTAMPTZ NOT NULL,
  days DOUBLE PRECISION NOT NULL DEFAULT 1,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_people_pto_employee ON people_pto_requests (tenant_id, segment_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_people_pto_status ON people_pto_requests (tenant_id, segment_id, status);
