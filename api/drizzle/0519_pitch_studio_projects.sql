-- 0519_pitch_studio_projects.sql — #1237 / #2133.
--
-- "A pitch is just a pitch in the studio." The candidate's video pitch moves
-- off the one-slot scalar users.video_pitch_url onto an ordinary studio
-- project with storyboard._purpose = 'pitch'. Its media is a linked
-- studio_recordings row — the exact shape POST /api/studio/recording/upload
-- writes (user_id, project_id, type, video_url, video_key, duration_ms,
-- metadata) — and studio_projects.is_current_pitch marks the one pitch per
-- user that recruiters and visitors see.
--
-- 1. studio_projects.is_current_pitch + partial unique index (at most one
--    current pitch per user). Both are declared in api/src/db/schema/
--    resumes.ts under the same names, so CI's `drizzle-kit push` (which runs
--    BEFORE this file) has usually created them already; IF NOT EXISTS makes
--    these statements no-ops then.
--
-- 2. Backfill — one pitch project + one recording per user with a non-blank
--    users.video_pitch_url, unless that user already has a current pitch.
--    Mirrors api/src/services/pitch/pitch-backfill.ts (mapLegacyPitch),
--    which is the unit-tested spec for this mapping. One statement
--    (data-modifying CTE), so a project never lands without its recording.
--    Idempotent: a re-run finds every migrated user already has a current
--    pitch and inserts nothing.
--
-- users.video_pitch_url / video_pitch_set_at are NOT dropped here: push runs
-- before the SQL migrations, so removing them from the schema in this deploy
-- would drop the data before this backfill reads it. A follow-up deploy
-- removes them from the schema and drops them (see the comment on the
-- columns in api/src/db/schema/users.ts). No code reads or writes them now.

ALTER TABLE studio_projects
  ADD COLUMN IF NOT EXISTS is_current_pitch boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_studio_projects_current_pitch_per_user
  ON studio_projects (user_id)
  WHERE is_current_pitch = true;

WITH src AS (
  SELECT
    u.id AS user_id,
    btrim(u.video_pitch_url) AS url,
    COALESCE(u.video_pitch_set_at, u.updated_at, now()) AS set_at
  FROM users u
  WHERE u.video_pitch_url IS NOT NULL
    AND btrim(u.video_pitch_url) <> ''
    AND NOT EXISTS (
      SELECT 1 FROM studio_projects sp
      WHERE sp.user_id = u.id AND sp.is_current_pitch = true
    )
),
proj AS (
  INSERT INTO studio_projects (
    user_id, resume_text, kind, media_kind, storyboard, status,
    is_current_pitch, created_at, updated_at
  )
  SELECT
    src.user_id,
    '',
    'scene',
    'video',
    jsonb_build_object('_name', 'My video pitch', '_purpose', 'pitch', '_rev', 1),
    'draft',
    true,
    src.set_at,
    src.set_at
  FROM src
  RETURNING id, user_id
)
INSERT INTO studio_recordings (
  user_id, project_id, type, video_url, video_key, duration_ms, metadata, created_at
)
SELECT
  proj.user_id::text,
  proj.id::text,
  'webcam',
  src.url,
  CASE
    WHEN src.url ~* '^https?://cdn\.hired\.video/'
      THEN NULLIF(regexp_replace(src.url, '^https?://cdn\.hired\.video/+', '', 'i'), '')
    ELSE NULL
  END,
  NULL,
  jsonb_build_object('source', 'legacy_video_pitch_url'),
  src.set_at
FROM proj
JOIN src ON src.user_id = proj.user_id;
