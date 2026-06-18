-- Migration 0462 — video_campaigns.project_ids jsonb → video_campaign_projects
-- junction table (gap #983).
--
-- Before: campaign↔project membership was a `project_ids` jsonb array on
-- `video_campaigns`. That shape can't answer "every campaign featuring
-- project X" without a sequential scan and can't enforce referential
-- integrity — a deleted studio_project leaves a dangling id in the array.
--
-- After: a proper many-to-many junction. The FKs cascade (deleting a
-- campaign or project removes its membership rows) and the index on
-- project_id makes the reverse lookup indexed. `position` preserves the
-- ordering the jsonb array carried implicitly.
--
-- The read/write paths (api/src/routes/studio.ts campaign routes) flip to
-- the junction in the same change set, so this migration ALSO drops the
-- legacy jsonb column once the backfill has copied every (campaign, project)
-- pair across. No reader is left pointing at the dropped column.
--
-- Idempotent per drizzle/TEMPLATE.md: CREATE ... IF NOT EXISTS everywhere,
-- the backfill ON CONFLICT DO NOTHING, and the column drop guarded by
-- IF EXISTS. Re-running against a DB where this already landed is a no-op.

-- ── junction table ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS video_campaign_projects (
  campaign_id  UUID NOT NULL REFERENCES video_campaigns(id)  ON DELETE CASCADE,
  project_id   UUID NOT NULL REFERENCES studio_projects(id)  ON DELETE CASCADE,
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One membership row per (campaign, project).
CREATE UNIQUE INDEX IF NOT EXISTS uq_video_campaign_projects
  ON video_campaign_projects (campaign_id, project_id);
-- Indexes the reverse lookup ("campaigns featuring project X").
CREATE INDEX IF NOT EXISTS idx_video_campaign_projects_project
  ON video_campaign_projects (project_id);

-- ── backfill from the legacy jsonb array ────────────────────────────────────
-- Only runs while the source column still exists (so a second deploy, after
-- the DROP below, skips it). Dangling ids (jsonb entries with no matching
-- studio_projects row) are filtered out so the project_id FK can't fail.
DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'video_campaigns' AND column_name = 'project_ids'
  ) THEN
    INSERT INTO video_campaign_projects (campaign_id, project_id, position)
    SELECT vc.id, elem.value::uuid, elem.ordinality - 1
      FROM video_campaigns vc,
           jsonb_array_elements_text(vc.project_ids)
             WITH ORDINALITY elem(value, ordinality)
     WHERE jsonb_typeof(vc.project_ids) = 'array'
       AND EXISTS (
         SELECT 1 FROM studio_projects sp WHERE sp.id = elem.value::uuid
       )
    ON CONFLICT (campaign_id, project_id) DO NOTHING;
  END IF;
END $migration$;

-- ── drop the legacy jsonb column ────────────────────────────────────────────
-- All read/write paths now query the junction (studio.ts campaign routes).
ALTER TABLE video_campaigns DROP COLUMN IF EXISTS project_ids;
