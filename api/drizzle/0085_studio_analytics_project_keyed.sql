-- 0085 — Re-key studio analytics from `videos.id` to `studio_projects.id`.
--
-- Why: post-#665 the unified <StudioPlayer/> can serve saved-public projects
-- without a rendered `videos` row, so analytics keyed on `videos.id` 404s
-- (or silently drops events) for those projects. The frontend was papering
-- over this by passing `project.id` where the API expected a video id,
-- which is what triggered the GET /api/studio/videos/:id/analytics 404.
--
-- The analytics unit of measurement is the project, not the rendered MP4.
-- This migration renames the FK on `video_analytics` and `studio_video_heatmap`
-- from `video_id (text)` to `studio_project_id (uuid)`, and renames the
-- jsonb membership array on `video_campaigns` from `video_ids` to
-- `project_ids` (the frontend already populates this with project ids —
-- see Outreach.tsx campaign create handler).
--
-- Backfill maps existing analytics rows via `studio_projects.video_id`.
-- Orphaned rows (video_id with no parent project) are dropped — they
-- were unreadable through the API anyway since every read path went
-- through ownership joins against `studio_projects`.

BEGIN;

-- ── video_analytics ─────────────────────────────────────────────────────────

ALTER TABLE video_analytics
  ADD COLUMN studio_project_id uuid;

UPDATE video_analytics va
   SET studio_project_id = sp.id
  FROM studio_projects sp
 WHERE sp.video_id IS NOT NULL
   AND sp.video_id::text = va.video_id;

DELETE FROM video_analytics WHERE studio_project_id IS NULL;

ALTER TABLE video_analytics
  ALTER COLUMN studio_project_id SET NOT NULL,
  ADD CONSTRAINT video_analytics_project_fk
    FOREIGN KEY (studio_project_id) REFERENCES studio_projects(id) ON DELETE CASCADE;

DROP INDEX IF EXISTS idx_video_analytics_video;
CREATE INDEX idx_video_analytics_project ON video_analytics(studio_project_id);

ALTER TABLE video_analytics DROP COLUMN video_id;

-- ── studio_video_heatmap ────────────────────────────────────────────────────

ALTER TABLE studio_video_heatmap
  ADD COLUMN studio_project_id uuid;

UPDATE studio_video_heatmap h
   SET studio_project_id = sp.id
  FROM studio_projects sp
 WHERE sp.video_id IS NOT NULL
   AND sp.video_id::text = h.video_id;

DELETE FROM studio_video_heatmap WHERE studio_project_id IS NULL;

ALTER TABLE studio_video_heatmap
  ALTER COLUMN studio_project_id SET NOT NULL,
  ADD CONSTRAINT studio_video_heatmap_project_fk
    FOREIGN KEY (studio_project_id) REFERENCES studio_projects(id) ON DELETE CASCADE;

CREATE INDEX idx_studio_video_heatmap_project ON studio_video_heatmap(studio_project_id);

ALTER TABLE studio_video_heatmap DROP COLUMN video_id;

-- ── video_campaigns.video_ids → project_ids ─────────────────────────────────
-- The frontend campaign builder (Outreach.tsx) already stores project ids
-- here; the column name was the only thing pretending otherwise. Rename
-- straight across — no value rewrite needed.

ALTER TABLE video_campaigns
  RENAME COLUMN video_ids TO project_ids;

COMMIT;
