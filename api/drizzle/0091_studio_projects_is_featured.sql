-- Migration 0091 — project-level "feature on homepage" flag.
--
-- `videos.is_featured` only existed once a project had been rendered to
-- an MP4. v2 (kind='nle') projects play live off `timeline_spec` via
-- <CanvasStatePreview/> and never need a baked MP4 — so requiring a
-- linked `videos` row to feature them on the homepage was the wrong
-- gate. Move the flag onto `studio_projects` so the SA can feature any
-- public project regardless of whether it's been exported.
--
-- The homepage carousel feed (`GET /api/studio/videos/featured`)
-- rewrites to query `studio_projects` directly and returns project ids;
-- the frontend's <StudioVideoSurface mode="lazy"/> hits
-- `/api/studio/public/:videoId` which already accepts project ids and
-- mounts <CanvasStatePreview/> off `timeline_spec`.
--
-- Backfill: every project whose linked video was previously featured
-- carries the flag forward. `videos.is_featured` stays in the schema
-- for the moment so a partial deploy doesn't lose state — its read
-- side is dropped immediately in this same change set, and a future
-- cleanup migration drops the column once we're confident.

ALTER TABLE "studio_projects"
  ADD COLUMN IF NOT EXISTS "is_featured" boolean DEFAULT false NOT NULL;

-- Backfill from the legacy videos-level flag.
UPDATE "studio_projects" sp
SET "is_featured" = true
FROM "videos" v
WHERE sp."video_id" = v."id"
  AND v."is_featured" = true
  AND sp."is_featured" = false;

-- Most queries select featured projects ordered by recency — a partial
-- index keeps the working set tiny since the vast majority of projects
-- are never featured.
CREATE INDEX IF NOT EXISTS "idx_studio_projects_is_featured"
  ON "studio_projects" ("updated_at" DESC)
  WHERE "is_featured" = true;
