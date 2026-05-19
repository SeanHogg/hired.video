-- 0096 — Unify Timeline JSON shape: split legacy `v2`-track widget clips
-- into one dedicated `widget-<id>` track per widget.
--
-- Background: every project authored through the V2 canvas-state editor
-- (`kind='nle'`) stores its composition as a Timeline JSON blob on
-- `studio_projects.timeline_spec`. The pre-#832 emit pooled every
-- widget clip onto a single `v2` video track. The renderer's invariant
-- is "one active clip per track per frame" — so two widgets simultaneously
-- visible on the same scene silently dropped one at render time, and
-- the reader switched to per-widget tracks (`widget-<widgetId>`) without
-- a compatibility shim, blanking every legacy project on the public
-- watch page + homepage hero + entity-card thumbnails.
--
-- This migration rewrites every stored `timeline_spec` so the system
-- holds ONE shape: a `v1` bg track, N `widget-<id>` tracks (one per
-- widget, sorted by z), `v3` scene-post, `a1` music, `a2` voiceover.
-- Idempotent: rows without a `v2` track are skipped; once converted,
-- a row can't match the WHERE again.

CREATE OR REPLACE FUNCTION _migrate_timeline_v2_to_widget_tracks(spec jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $body$
DECLARE
  v2_track jsonb;
  widget_tracks jsonb := '[]'::jsonb;
  new_tracks jsonb := '[]'::jsonb;
  t jsonb;
BEGIN
  IF spec IS NULL OR jsonb_typeof(spec->'tracks') <> 'array' THEN
    RETURN spec;
  END IF;

  -- Pull the v2 track out (if present).
  SELECT x INTO v2_track
    FROM jsonb_array_elements(spec->'tracks') AS x
   WHERE x->>'id' = 'v2' AND x->>'kind' = 'video'
   LIMIT 1;

  IF v2_track IS NULL THEN
    RETURN spec;
  END IF;

  -- Build one widget track per v2 clip, sorted by the clip's first-effect
  -- params.z (matches what `canvasStateToTimeline` does at emit time).
  -- Widgets without an explicit z fall back to 1.
  IF jsonb_typeof(v2_track->'clips') = 'array'
     AND jsonb_array_length(v2_track->'clips') > 0 THEN
    SELECT jsonb_agg(
             jsonb_build_object(
               'id',     'widget-' || (clip->>'id'),
               'kind',   'video',
               'label',  COALESCE(
                           regexp_replace(clip->'effects'->0->>'kind', '^canvas-v2:', ''),
                           'widget'
                         ),
               'gain',   1,
               'pan',    0,
               'muted',  false,
               'solo',   false,
               'locked', false,
               'clips',  jsonb_build_array(clip)
             )
             ORDER BY COALESCE((clip->'effects'->0->'params'->>'z')::numeric, 1)
           )
      INTO widget_tracks
      FROM jsonb_array_elements(v2_track->'clips') AS clip;
  END IF;

  -- Rebuild tracks: walk original order, splice widget tracks where v2
  -- used to be (preserves v1/v3/a1/a2 relative positions). v2 is dropped
  -- regardless of whether it had clips — it's a dead seed otherwise.
  FOR t IN SELECT x FROM jsonb_array_elements(spec->'tracks') AS x
  LOOP
    IF t->>'id' = 'v2' AND t->>'kind' = 'video' THEN
      new_tracks := new_tracks || widget_tracks;
    ELSE
      new_tracks := new_tracks || jsonb_build_array(t);
    END IF;
  END LOOP;

  RETURN jsonb_set(spec, '{tracks}', new_tracks);
END;
$body$;

UPDATE studio_projects
   SET timeline_spec = _migrate_timeline_v2_to_widget_tracks(timeline_spec),
       updated_at    = NOW()
 WHERE timeline_spec IS NOT NULL
   AND jsonb_path_exists(timeline_spec, '$.tracks[*] ? (@.id == "v2" && @.kind == "video")');

DROP FUNCTION _migrate_timeline_v2_to_widget_tracks(jsonb);
