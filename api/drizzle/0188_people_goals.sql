-- Migration 0188 — People Operations Goals / OKRs (PO-4).
--
-- Segment-scoped OKRs owned by a roster employee. key_results is an ordered
-- JSON array; the goal's progress rolls up from them in the service layer.
-- The "Strategy" embed surface (#1814) exposes these read-only.
--
-- Idempotent per drizzle/TEMPLATE.md.

CREATE TABLE IF NOT EXISTS people_goals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES people_tenants(id) ON DELETE CASCADE,
  segment_id   UUID NOT NULL REFERENCES people_segments(id) ON DELETE CASCADE,
  employee_id  UUID NOT NULL REFERENCES people_employees(id) ON DELETE CASCADE,
  milestone_id UUID,
  title        VARCHAR(300) NOT NULL,
  description  TEXT,
  status       VARCHAR(16) NOT NULL DEFAULT 'not_started'
                 CHECK (status IN ('not_started','in_progress','completed','on_hold','blocked','cancelled','at_risk')),
  priority     VARCHAR(16) NOT NULL DEFAULT 'medium'
                 CHECK (priority IN ('low','medium','high','critical')),
  due_date     TIMESTAMPTZ,
  progress     INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  category     VARCHAR(120),
  key_results  JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_people_goals_employee
  ON people_goals (tenant_id, segment_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_people_goals_status
  ON people_goals (tenant_id, segment_id, status);
