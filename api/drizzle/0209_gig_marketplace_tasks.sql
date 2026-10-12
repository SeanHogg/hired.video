-- 0209_gig_marketplace_tasks.sql
-- Gig marketplace → reusable task board bridge (#101 frontend light-up).
--
-- Hybrid model: gig_projects/gig_bids own the marketplace + bidding + escrow
-- (already shipped, #101). Deliverable items are gig_milestones, defined by
-- the poster at post time. On award, GigService materialises each milestone
-- as a personal `tasks` row owned by the winning creator — so the creator
-- works the gig on the SAME reusable kanban board as their personal tasks,
-- surfaced under Content Creator → Gigs. These two columns are the link.
--
-- Idempotent per drizzle/TEMPLATE.md.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS gig_project_id UUID;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS gig_milestone_id UUID;

-- FKs are added NOT VALID + idempotent so the alter never blocks on a full
-- table scan and re-running the migration is a no-op. ON DELETE SET NULL so a
-- cancelled gig leaves the creator's task as a standalone follow-up rather
-- than vanishing mid-flight (mirrors source_event_id's survive-cancel rule).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_gig_project_id_fkey') THEN
    ALTER TABLE tasks
      ADD CONSTRAINT tasks_gig_project_id_fkey
      FOREIGN KEY (gig_project_id) REFERENCES gig_projects(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_gig_milestone_id_fkey') THEN
    ALTER TABLE tasks
      ADD CONSTRAINT tasks_gig_milestone_id_fkey
      FOREIGN KEY (gig_milestone_id) REFERENCES gig_milestones(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Gig poster's progress query — all work items for one gig, regardless of
-- which creator owns them. One unique guard so the award bridge can't double-
-- materialise a milestone into two tasks if retried.
CREATE INDEX IF NOT EXISTS idx_tasks_gig_project ON tasks(gig_project_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_gig_milestone
  ON tasks(gig_milestone_id) WHERE gig_milestone_id IS NOT NULL;
