-- 0615_resume_video_meta_columns.sql
--
-- W3-D1. The public video feed (services/studio/public-video-feed.ts) read
-- resume_information.content->'meta'->'video'->>'themeId' and
-- ->'targeting'->>'goal' per row. Promote both to typed columns maintained on
-- every content write (repositories/resumeVideoMetaColumns.ts, used by the
-- résumé repository's insert/update and the feedback "apply" write), which
-- stores only ids the app recognises. The backfill copies short legacy values
-- as-is (goal checked against shared/video-targeting.ts VIDEO_GOALS); the feed
-- mapper still validates the theme id on read. Idempotent.

ALTER TABLE resume_information ADD COLUMN IF NOT EXISTS video_theme_id varchar(32);
ALTER TABLE resume_information ADD COLUMN IF NOT EXISTS video_goal varchar(16);

UPDATE resume_information
SET video_theme_id = CASE
      WHEN length(content->'meta'->'video'->>'themeId') <= 32 THEN content->'meta'->'video'->>'themeId'
    END,
    video_goal = CASE
      WHEN content->'meta'->'video'->'targeting'->>'goal' IN ('fullTime', 'contract', 'fractional', 'next')
      THEN content->'meta'->'video'->'targeting'->>'goal'
    END
WHERE video_theme_id IS NULL
  AND video_goal IS NULL
  AND jsonb_typeof(content->'meta'->'video') = 'object';
