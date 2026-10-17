-- 0611_studio_projects_legacy_state_archive.sql
--
-- W3-D1 archive-first step for the per-kind state columns 0610 collapsed into
-- studio_projects.state. Snapshots every row that still holds data in any of
-- them into archive.studio_projects_legacy_state (keyed by the project id), so
-- a follow-up that removes the frozen columns from the schema loses nothing.
-- interactive_comic_state is NOT here — it stays a live column (genuine pair).
--
-- Idempotent: ON CONFLICT DO NOTHING on the carried-over project id.

CREATE SCHEMA IF NOT EXISTS archive;

CREATE TABLE IF NOT EXISTS archive.studio_projects_legacy_state (
  project_id      uuid PRIMARY KEY,
  media_kind      varchar(24),
  timeline_spec   jsonb,
  game_state      jsonb,
  comic_state     jsonb,
  image_state     jsonb,
  animation_state jsonb,
  cad_state       jsonb,
  cad_3d_state    jsonb,
  document_state  jsonb,
  archived_at     timestamptz NOT NULL DEFAULT now()
);

INSERT INTO archive.studio_projects_legacy_state
  (project_id, media_kind, timeline_spec, game_state, comic_state, image_state,
   animation_state, cad_state, cad_3d_state, document_state)
SELECT id, media_kind, timeline_spec, game_state, comic_state, image_state,
       animation_state, cad_state, cad_3d_state, document_state
FROM studio_projects
WHERE timeline_spec IS NOT NULL OR game_state IS NOT NULL OR comic_state IS NOT NULL
   OR image_state IS NOT NULL OR animation_state IS NOT NULL OR cad_state IS NOT NULL
   OR cad_3d_state IS NOT NULL OR document_state IS NOT NULL
ON CONFLICT (project_id) DO NOTHING;
