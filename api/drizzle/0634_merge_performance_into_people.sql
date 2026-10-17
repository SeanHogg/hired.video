-- 0634_merge_performance_into_people.sql
--
-- W3-D2 (architecture remediation 2026-10-17): ONE performance engine.
--
-- Two engines stored the same concepts:
--   * performance_goals / performance_reviews — user-scoped (users.id), no
--     tenant/segment isolation, written only by routes/performance.ts.
--   * people_goals / people_performance_reviews — the segment-scoped CHRO
--     engine (Tenant -> Segment -> roster employee), richer (key_results,
--     priority, CHECKed status vocab) and used by the People Ops UI + embeds.
--
-- people_* is canonical (docs/01-domain-model.md §4.3: "hired.video has ONE
-- PerformanceReview keyed on employeeId; the flat shape's fields become a
-- field-union"). This file:
--   1. adds the field-union columns the user-scoped shape carried
--      (cycle link, completed/submitted/acknowledged timestamps, review goals
--      + ratings JSON, reviewee response);
--   2. backfills both retired tables into the canonical ones, carrying the
--      row ids over (ON CONFLICT (id) DO NOTHING => idempotent).
--
-- A retired row is resolved onto the user's roster row (people_employees with
-- user_id = the row's user; the earliest roster row when the user sits on
-- several segments). Rows whose user has NO roster row cannot be placed in a
-- segment and are not copied — they survive untouched in archive.* after 0635.
-- The reviewer is resolved inside the reviewee's segment; NULL when the
-- reviewer is not on that roster (reviewer_id is nullable by design).
--
-- performance_cycles stays live (no duplicate exists); both canonical tables
-- now point at it via cycle_id ON DELETE SET NULL.
--
-- Idempotent per drizzle/TEMPLATE.md. 0635 archives the retired tables.

-- ── 1. Field-union columns ──────────────────────────────────────────────────
ALTER TABLE people_goals ADD COLUMN IF NOT EXISTS cycle_id UUID;
ALTER TABLE people_goals ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

ALTER TABLE people_performance_reviews ADD COLUMN IF NOT EXISTS cycle_id UUID;
ALTER TABLE people_performance_reviews ADD COLUMN IF NOT EXISTS goals JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE people_performance_reviews ADD COLUMN IF NOT EXISTS ratings JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE people_performance_reviews ADD COLUMN IF NOT EXISTS reviewee_response TEXT;
ALTER TABLE people_performance_reviews ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE people_performance_reviews ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;

-- Constraint names match drizzle-kit's generated names so push and this file
-- converge on ONE constraint whichever runs first.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'people_goals_cycle_id_performance_cycles_id_fk') THEN
    ALTER TABLE people_goals ADD CONSTRAINT people_goals_cycle_id_performance_cycles_id_fk
      FOREIGN KEY (cycle_id) REFERENCES performance_cycles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'people_performance_reviews_cycle_id_performance_cycles_id_fk') THEN
    ALTER TABLE people_performance_reviews ADD CONSTRAINT people_performance_reviews_cycle_id_performance_cycles_id_fk
      FOREIGN KEY (cycle_id) REFERENCES performance_cycles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_people_goals_cycle_id ON people_goals (cycle_id);
CREATE INDEX IF NOT EXISTS idx_people_performance_reviews_cycle_id ON people_performance_reviews (cycle_id);

-- ── 2. Backfill performance_goals -> people_goals ───────────────────────────
DO $$
BEGIN
  IF to_regclass('public.performance_goals') IS NOT NULL THEN
    INSERT INTO people_goals (
      id, tenant_id, segment_id, employee_id, title, description, status,
      priority, due_date, progress, category, key_results, cycle_id,
      completed_at, created_at, updated_at
    )
    SELECT
      g.id, e.tenant_id, e.segment_id, e.id,
      left(g.title, 300),
      g.description,
      CASE WHEN g.status IN ('not_started','in_progress','completed','on_hold','blocked','cancelled','at_risk')
           THEN g.status ELSE 'in_progress' END,
      'medium',
      g.target_date,
      LEAST(100, GREATEST(0, g.progress_percentage)),
      left(g.category, 120),
      '[]'::jsonb,
      gc.id,
      g.completed_at,
      g.created_at,
      g.updated_at
    FROM performance_goals g
    LEFT JOIN performance_cycles gc ON gc.id = g.cycle_id
    JOIN LATERAL (
      SELECT pe.id, pe.tenant_id, pe.segment_id
      FROM people_employees pe
      WHERE pe.user_id = g.user_id
      ORDER BY pe.created_at, pe.id
      LIMIT 1
    ) e ON true
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- ── 3. Backfill performance_reviews -> people_performance_reviews ────────────
-- Status vocab: pending -> scheduled; in_progress kept; submitted/acknowledged
-- -> completed (the submitted_at / acknowledged_at stamps keep the nuance).
-- review_type + period_label come from the cycle (quarterly|annual|mid-year|
-- probationary -> quarterly|annual|mid_year|probation).
DO $$
BEGIN
  IF to_regclass('public.performance_reviews') IS NOT NULL THEN
    INSERT INTO people_performance_reviews (
      id, tenant_id, segment_id, employee_id, reviewer_id, review_type, status,
      scheduled_date, completed_date, period_label, rating, strengths,
      areas_for_improvement, comments, cycle_id, goals, ratings,
      reviewee_response, submitted_at, acknowledged_at, created_at, updated_at
    )
    SELECT
      r.id, e.tenant_id, e.segment_id, e.id, rv.id,
      CASE c.type
        WHEN 'annual' THEN 'annual'
        WHEN 'mid-year' THEN 'mid_year'
        WHEN 'probationary' THEN 'probation'
        ELSE 'quarterly'
      END,
      CASE r.status
        WHEN 'in_progress' THEN 'in_progress'
        WHEN 'submitted' THEN 'completed'
        WHEN 'acknowledged' THEN 'completed'
        ELSE 'scheduled'
      END,
      c.start_date,
      CASE WHEN r.status IN ('submitted','acknowledged')
           THEN COALESCE(r.submitted_at, r.acknowledged_at) END,
      left(c.name, 60),
      r.overall_rating::double precision,
      r.strengths,
      r.areas_for_improvement,
      r.reviewer_notes,
      c.id,
      COALESCE(r.goals, '[]'::jsonb),
      COALESCE(r.ratings, '{}'::jsonb),
      r.reviewee_response,
      CASE WHEN r.status IN ('submitted','acknowledged')
           THEN COALESCE(r.submitted_at, r.acknowledged_at, r.updated_at) END,
      CASE WHEN r.status = 'acknowledged'
           THEN COALESCE(r.acknowledged_at, r.updated_at) END,
      r.created_at,
      r.updated_at
    FROM performance_reviews r
    LEFT JOIN performance_cycles c ON c.id = r.cycle_id
    JOIN LATERAL (
      SELECT pe.id, pe.tenant_id, pe.segment_id
      FROM people_employees pe
      WHERE pe.user_id = r.reviewee_user_id
      ORDER BY pe.created_at, pe.id
      LIMIT 1
    ) e ON true
    LEFT JOIN LATERAL (
      SELECT pe.id
      FROM people_employees pe
      WHERE pe.user_id = r.reviewer_user_id
        AND pe.tenant_id = e.tenant_id
        AND pe.segment_id = e.segment_id
      LIMIT 1
    ) rv ON true
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
