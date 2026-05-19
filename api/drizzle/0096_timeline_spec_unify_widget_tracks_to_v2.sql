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
  legacy_clips jsonb;
  existing_v2_clips jsonb;
  merged_clips jsonb;
  v2_track jsonb;
  new_tracks jsonb := '[]'::jsonb;
  v2_emitted boolean := false;
  cur_track jsonb;
BEGIN
  IF spec IS NULL OR jsonb_typeof(spec->'tracks') <> 'array' THEN
    RETURN spec;
  END IF;

  -- Collect every legacy widget-* clip, z-sorted (the emit-side ordering
  -- contract). Aliases use `track_elem` / `cur_track` to avoid colliding
  -- with declared variables (PG raises "column reference is ambiguous"
  -- when a DECLARE-d identifier shadows a SELECT alias).
  SELECT jsonb_agg(
           (track_elem->'clips'->0)
           ORDER BY COALESCE(
             ((track_elem->'clips'->0)->'effects'->0->'params'->>'z')::numeric,
             1
           )
         )
    INTO legacy_clips
    FROM jsonb_array_elements(spec->'tracks') AS track_elem
   WHERE track_elem->>'id' LIKE 'widget-%' AND track_elem->>'kind' = 'video';

  -- If there are no widget-* tracks, there's nothing to fold. Skip.
  IF legacy_clips IS NULL THEN
    RETURN spec;
  END IF;

  -- Pre-existing v2 track's clips (if any) — preserved so a layered
  -- save that left BOTH v2 and widget-* on disk merges cleanly instead
  -- of overwriting one with the other.
  SELECT (track_elem->'clips') INTO existing_v2_clips
    FROM jsonb_array_elements(spec->'tracks') AS track_elem
   WHERE track_elem->>'id' = 'v2' AND track_elem->>'kind' = 'video'
   LIMIT 1;

  -- Merge + dedupe by clip.id. v2 entries win order so an explicit
  -- post-#832 save is preserved; legacy widget-* entries fill in the
  -- gaps.
  SELECT jsonb_agg(elem ORDER BY ord) INTO merged_clips
  FROM (
    SELECT DISTINCT ON (elem->>'id') elem, ord
      FROM (
        SELECT elem, ord
          FROM jsonb_array_elements(COALESCE(existing_v2_clips, '[]'::jsonb))
            WITH ORDINALITY AS x(elem, ord)
        UNION ALL
        SELECT elem, (1000000 + ord) AS ord
          FROM jsonb_array_elements(legacy_clips)
            WITH ORDINALITY AS y(elem, ord)
      ) AS all_clips
      ORDER BY elem->>'id', ord
  ) AS deduped;

  v2_track := jsonb_build_object(
    'id',     'v2',
    'kind',   'video',
    'label',  'Widgets',
    'gain',   1,
    'pan',    0,
    'muted',  false,
    'solo',   false,
    'locked', false,
    'clips',  COALESCE(merged_clips, '[]'::jsonb)
  );

  -- Rebuild tracks: drop every widget-* track AND any existing v2
  -- track; splice the unified v2 in at the position of the first
  -- replaced track so paint order stays v1 → v2 → v3 → audio.
  FOR cur_track IN
    SELECT track_elem
      FROM jsonb_array_elements(spec->'tracks') AS track_elem
  LOOP
    IF (cur_track->>'id' LIKE 'widget-%' OR cur_track->>'id' = 'v2')
       AND cur_track->>'kind' = 'video' THEN
      IF NOT v2_emitted THEN
        new_tracks := new_tracks || jsonb_build_array(v2_track);
        v2_emitted := true;
      END IF;
    ELSE
      new_tracks := new_tracks || jsonb_build_array(cur_track);
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
