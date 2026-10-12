-- 0083 — studio_projects.is_public: project-level visibility flag
--
-- Closes gap #667. Before the Save/Publish split (#665, 2026-05-16),
-- "make this video public" meant flipping the linked videos row's
-- `privacy_status` because the only way to view a video was its
-- rendered MP4. After #665 the unified <StudioPlayer/> plays the
-- saved storyboard/script JSON live, so a project is viewable in-
-- platform the moment it's saved + made public — no MP4 required.
--
-- The PATCH /api/studio/projects/:id/visibility endpoint previously
-- short-circuited when `videoId` was null (nothing to write to), so
-- toggling Public on a draft did nothing server-side. This column is
-- the authoritative project-level visibility flag; `videos.privacy_status`
-- remains the gate for the off-platform CDN URL once a render exists.

ALTER TABLE studio_projects
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

-- Backfill: any project whose linked video is already public should stay
-- public after this migration so the in-platform watch route keeps
-- working without a user action.
UPDATE studio_projects sp
  SET is_public = true
  FROM videos v
  WHERE sp.video_id = v.id
    AND v.privacy_status = 'public'
    AND sp.is_public = false;
