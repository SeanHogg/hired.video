-- 0096 — Unify Timeline JSON shape: fold per-widget `widget-<id>` tracks
-- back into a single `v2` overlay track.
--
-- Background: between #832 and the unification pass, `canvasStateToTimeline`
-- emitted one dedicated track per widget (`widget-<widgetId>`) as a
-- workaround for the renderer's then-current "one active clip per track
-- per frame" rule, which would have silently dropped every simultaneous
-- widget after the first if widgets shared a track.
--
-- The unification fixed the renderer instead: `activeClipsAt` now draws
-- every clip whose visible window contains the current frame, in clip-
-- array order. With that constraint gone, every widget clip lives on a
-- single shared `v2` track (sorted globally by `widget.position.z` at
-- emit time so array order = paint order at render time).
--
-- This migration converts in-place: every `widget-<id>` track's single
-- clip is collected, z-sorted, and folded into a single `v2` track that
-- splices in where the first widget-* track was. The schema reads as
-- one consistent five-track shape afterwards (`v1` / `v2` / `v3` / `a1` /
-- `a2`); no JS-side back-compat shim is needed in the reader.
--
-- Idempotent: rows whose `timeline_spec` already has a `v2` track and no
-- `widget-<id>` tracks are skipped; once converted, a row can't match the
-- WHERE again.

CREATE OR REPLACE FUNCTION _unify_widget_tracks_to_v2(spec jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $body$
DECLARE
  v2_clips jsonb;
  v2_track jsonb;
  new_tracks jsonb := '[]'::jsonb;
  spliced boolean := false;
  t jsonb;
BEGIN
  IF spec IS NULL OR jsonb_typeof(spec->'tracks') <> 'array' THEN
    RETURN spec;
  END IF;

  -- Gather every widget clip (one per widget-<id> track), z-sorted via
  -- the clip's first-effect params.z field that emit time set.
  SELECT jsonb_agg(
           (t->'clips'->0)
           ORDER BY COALESCE(
             ((t->'clips'->0)->'effects'->0->'params'->>'z')::numeric,
             1
           )
         )
    INTO v2_clips
    FROM jsonb_array_elements(spec->'tracks') AS t
   WHERE t->>'id' LIKE 'widget-%' AND t->>'kind' = 'video';

  -- No widget-* tracks → nothing to fold. Leave the row alone.
  IF v2_clips IS NULL THEN
    RETURN spec;
  END IF;

  v2_track := jsonb_build_object(
    'id',     'v2',
    'kind',   'video',
    'label',  'Widgets',
    'gain',   1,
    'pan',    0,
    'muted',  false,
    'solo',   false,
    'locked', false,
    'clips',  v2_clips
  );

  -- Rebuild tracks: keep v1/v3/a1/a2/other tracks; drop every widget-*
  -- track; splice the new v2 track in at the position of the FIRST
  -- widget track we encountered so paint order stays after v1 + before
  -- v3 — same layering the renderer expects.
  FOR t IN SELECT x FROM jsonb_array_elements(spec->'tracks') AS x
  LOOP
    IF t->>'id' LIKE 'widget-%' AND t->>'kind' = 'video' THEN
      IF NOT spliced THEN
        new_tracks := new_tracks || jsonb_build_array(v2_track);
        spliced := true;
      END IF;
    ELSE
      new_tracks := new_tracks || jsonb_build_array(t);
    END IF;
  END LOOP;

  RETURN jsonb_set(spec, '{tracks}', new_tracks);
END;
$body$;

UPDATE studio_projects
   SET timeline_spec = _unify_widget_tracks_to_v2(timeline_spec),
       updated_at    = NOW()
 WHERE timeline_spec IS NOT NULL
   AND jsonb_path_exists(
         timeline_spec,
         '$.tracks[*] ? (@.id starts with "widget-" && @.kind == "video")'
       );

DROP FUNCTION _unify_widget_tracks_to_v2(jsonb);
