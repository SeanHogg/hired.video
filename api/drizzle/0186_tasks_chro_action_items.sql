-- Migration 0186 — unify CHRO action items into the existing `tasks` table.
--
-- Instead of a parallel people_action_items table, a CHRO action item is a
-- `tasks` row scoped to a segment (tenant_id, segment_id set) and assigned to a
-- roster employee. Personal kanban tasks keep segment_id NULL; the two never
-- bleed because every personal-task query filters `segment_id IS NULL` and
-- every CHRO read filters on the segment.
--
-- Idempotent per drizzle/TEMPLATE.md.

-- New columns (nullable; personal tasks leave them NULL).
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS segment_id UUID;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_employee_id UUID;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS one_on_one_id UUID;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_type VARCHAR(16);

-- CHRO action items have no personal board — board_id becomes nullable.
ALTER TABLE tasks ALTER COLUMN board_id DROP NOT NULL;

-- FKs into the people-ops graph (gated — Postgres has no IF NOT EXISTS for ADD
-- CONSTRAINT). ON DELETE: tenant/segment cascade (segment teardown removes its
-- action items); employee/1:1 SET NULL (the item survives as a manual to-do).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_tenant_id_fkey') THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES people_tenants(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_segment_id_fkey') THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_segment_id_fkey
      FOREIGN KEY (segment_id) REFERENCES people_segments(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_assignee_employee_id_fkey') THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_assignee_employee_id_fkey
      FOREIGN KEY (assignee_employee_id) REFERENCES people_employees(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_one_on_one_id_fkey') THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_one_on_one_id_fkey
      FOREIGN KEY (one_on_one_id) REFERENCES people_one_on_ones(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_source_type_check') THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_source_type_check
      CHECK (source_type IS NULL OR source_type IN
        ('one_on_one', 'meeting', 'sync', 'milestone', 'review', 'interview', 'manual')) NOT VALID;
  END IF;
END $$;

-- CHRO action-item inbox per segment + traceability back to a 1:1.
CREATE INDEX IF NOT EXISTS idx_tasks_segment_status ON tasks (segment_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_one_on_one ON tasks (one_on_one_id);
