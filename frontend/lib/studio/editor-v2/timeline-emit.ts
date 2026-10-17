/**
 * Convert the v2 editor's CanvasState to/from Timeline JSON.
 *
 * The CanvasState is the authoring format (scenes + percentage-positioned
 * widgets). The Timeline JSON is the render input (frame-accurate tracks
 * + clips + effects). One direction is lossy by nature — Timeline JSON
 * can express compositions the canvas-state can't represent (multi-track
 * overlapping clips with arbitrary effect chains). The round-trip is
 * lossless for canvas-state-authored projects only.
 *
 * Each widget serializes to ONE ClipEffect on an overlay clip. Position
 * (x/y/width/height) is fused into the effect's params alongside the
 * content fields, so the render-side applier reads everything in a
 * single dispatch. See `frontend/lib/timeline/effects/canvas-v2.ts` for
 * the matching appliers.
 *
 * Per the standing DRY rule: every save path calls `canvasStateToTimeline()`.
 * There is no parallel emit code anywhere else.
 */

import {
  type AudioLayer,
  buildAudioLayers,
  CANVAS_STATE_VERSION,
  type CanvasState,
  emptyCanvasState,
  type Scene,
} from "./canvas-state";
import { emitSceneTransitions } from "./scene-transition-emit";
import { SCENE_GRADE_EFFECT, filtersToCss } from "../video-filters";
import { fontFamilyFor } from "../font-catalog";
import { stringOr } from "@/lib/numeric";
import type { RenderContext } from "../widgets/plugin";
import { TIMELINE_SCHEMA_VERSION, defaultTrack, type Clip, type ClipEffect, type Timeline, type Track } from "@shared/timeline";
import { emitAudioRenderClips, recoverAudioLayersFromClips } from "./timeline-audio-emit";
import { clipToWidget, collectWidgetClips, isWidget, widgetToClip } from "./timeline-widget-emit";

// Kept on this module's public surface — every render entry point imports
// it from here alongside `canvasStateToTimeline`.
export { resolveTimelineAudioSources } from "./timeline-audio-emit";

/**
 * Emit a Timeline JSON document from canvas state. Each scene becomes a
 * background clip on `v1`; every widget across every scene is appended
 * to `v2` as an overlay clip. There is ONE timeline shape: the same
 * five tracks, the same clip semantics, the same paint order — no
 * legacy/new branching anywhere. The render-side enforces the layering
 * via `activeClipsAt` (returns every clip whose visible window contains
 * the current frame, in clip-array order), so multiple simultaneous
 * widgets all draw. Clips on v2 are sorted by `widget.position.z`
 * before emit so array order = paint order at render time.
 */
export function canvasStateToTimeline(stateInput: CanvasState): Timeline {
  // Defensive normalization: a draft persisted by an OLDER app shape (or a
  // partial localStorage rehydration) may lack newer array fields. The emitter
  // does `for (const vo of state.voiceovers)`, which throws "voiceovers is not
  // iterable" on a pre-voiceovers draft — so guarantee the iterables exist
  // before any consumer touches them.
  const state: CanvasState = {
    ...stateInput,
    scenes: stateInput.scenes ?? [],
    // A draft persisted by an OLDER app shape may carry `musicSource` +
    // `voiceovers[]` instead of `audioLayers[]`. `buildAudioLayers`
    // migrates either shape forward so the emit loop always iterates
    // the unified list. (Already-normalized states pass through.)
    audioLayers: buildAudioLayers(stateInput as Parameters<typeof buildAudioLayers>[0]),
  };
  const fps = state.fps;
  let cursor = 0;

  const v1: Track = defaultTrack({ id: "v1", kind: "video", label: "Background" });
  // `v2` ("widgets") carries every overlay clip in the composition.
  // The renderer iterates every active clip on it per frame, in array
  // order, so we sort the clips by z before final assembly. Flag
  // `allowsOverlap` so `isRenderable` skips the no-overlap invariant
  // for this track — multiple simultaneous widgets are the design.
  const v2: Track = defaultTrack({
    id: "v2",
    kind: "video",
    label: "Widgets",
    allowsOverlap: true,
  });
  // `v3` ("scene-post") sits ABOVE the widget track so its sourceless
  // clips' effects run after every widget has been composited — that's
  // what lets scene-level blur / glow / vignette / film-grain see the
  // full frame instead of just the bg. Adding a clip is `{startFrame,
  // durationFrames, effects: scene.effects}` with no source draw.
  const v3: Track = defaultTrack({ id: "v3", kind: "video", label: "Scene post" });
  // a1 carries every music + sfx layer, a2 every voiceover layer. Both
  // allow overlap now that there can be MANY simultaneous layers (the
  // multi-track audio rebuild) — the render audio mixer sums all active
  // clips per lane.
  const a1: Track = defaultTrack({ id: "a1", kind: "audio", label: "A1", allowsOverlap: true });
  const a2: Track = defaultTrack({ id: "a2", kind: "audio", label: "A2", allowsOverlap: true });
  // Collect widget clips with their z so we can sort them globally
  // before pushing into v2 (paint order = clip-array order).
  const widgetEntries: Array<{ clip: Clip; z: number }> = [];

  // The full `audioLayers[]` snapshot rides on the first scene's
  // background effect params (same place audioMix rides) so the editor's
  // Timeline round-trip (`timelineToCanvasState`) recovers every layer
  // LOSSLESSLY — trims, fades, splits, multiple music beds, and
  // pending-synthesis voiceover scripts (text + empty url) all survive a
  // save → load cycle. The a1/a2 clips below are the *render* projection
  // (playable layers only); this snapshot is the *editor* projection.
  const audioLayersSnapshot = state.audioLayers;
  // Project-level values the export painter needs (plugin widgets only).
  // The target is NOT saved — only an export render copy carries it.
  const render: Pick<RenderContext, "fontFamily"> = { fontFamily: fontFamilyFor(state.fontFamily) };

  for (const scene of state.scenes) {
    const sceneFrames = Math.max(1, Math.round(scene.durationSeconds * fps));

    v1.clips.push({
      id: `${scene.id}_bg`,
      sourceId: "",
      startFrame: cursor,
      durationFrames: sceneFrames,
      sourceInFrame: 0,
      // v1-preserved fields (sourceSceneType, sourceEnterAnimations,
      // effects, label, filters) ride along on the background effect
      // params so the round-trip through Timeline JSON is lossless
      // even for projects that were originally authored in v1 (gap
      // #611). Reads happen in `timelineToCanvasState` below.
      effects: [
        {
          kind: "canvas-v2:background",
          params: {
            color: scene.backgroundColor,
            sceneId: scene.id,
            label: scene.label,
            ...(scene.backgroundEffect ? { backgroundEffect: scene.backgroundEffect } : {}),
            ...(scene.sourceSceneType ? { sourceSceneType: scene.sourceSceneType } : {}),
            ...(scene.sourceEnterAnimations
              ? { sourceEnterAnimations: scene.sourceEnterAnimations }
              : {}),
            ...(scene.filters ? { sceneFilters: scene.filters } : {}),
            ...(scene.transitionIn ? { transitionIn: scene.transitionIn } : {}),
            // Director's notes — preserved on the bg effect so the
            // editor's "notes on this scene" badge survives a save →
            // load cycle. Empty / nullish notes don't ride along to
            // keep the saved payload minimal.
            ...(scene.directorNotes ? { directorNotes: scene.directorNotes } : {}),
            // Stash audioMix on the FIRST scene's background only —
            // saves space and gives the read-side one obvious place
            // to look. The mix is canvas-scoped, not scene-scoped.
            ...(cursor === 0 && state.audioMix ? { audioMix: state.audioMix } : {}),
            ...(cursor === 0 && audioLayersSnapshot.length
              ? { audioLayers: audioLayersSnapshot }
              : {}),
          },
        },
      ],
    });

    for (const widget of scene.widgets) {
      const clip = widgetToClip(widget, cursor, sceneFrames, fps, render);
      if (!clip) continue;
      widgetEntries.push({ clip, z: widget.position.z });
    }

    // Scene-level post-effects ride on v3 (sourceless clip with the
    // effect chain) so the compositor runs them AFTER all widgets are
    // drawn — full-frame ops (blur / glow / vignette / film-grain /
    // chromatic-aberration / sharpen / glitch) see the composite, not
    // just the bg. Skip emitting a v3 clip when the scene has no
    // effects so the timeline stays minimal.
    //
    // The scene's colour grade (`scene.filters`) runs FIRST in that chain
    // (#583): the scene-grade effect is the one filter path — the playback
    // preview and the export both render this Timeline through
    // `renderTimelineFrame`, so they grade identically. The grade is
    // render-only — the editor reads `filters` back from `sceneFilters` on
    // the bg effect, and `timelineToCanvasState` drops this entry.
    const postEffects: ClipEffect[] = [
      ...(filtersToCss(scene.filters) ? [{ kind: SCENE_GRADE_EFFECT, params: { filters: scene.filters } }] : []),
      ...(scene.effects ?? []).map((e) => ({ kind: e.kind, params: e.params ?? {} })),
    ];
    if (postEffects.length > 0) {
      v3.clips.push({
        id: `${scene.id}_post`,
        sourceId: "",
        startFrame: cursor,
        durationFrames: sceneFrames,
        sourceInFrame: 0,
        effects: postEffects,
      });
    }

    cursor += sceneFrames;
  }

  // Audio layers → a1/a2 render clips (timeline-audio-emit.ts).
  emitAudioRenderClips(state, cursor / fps, a1, a2);

  // Sort widget clips by z and push into v2 so the renderer paints
  // lower-z first and higher-z on top — same compositing order
  // CanvasStage uses via CSS z-index. Two widgets in different scenes
  // never share a frame (scenes are sequential), so a stable global
  // sort is sufficient.
  widgetEntries.sort((a, b) => a.z - b.z);
  for (const { clip } of widgetEntries) v2.clips.push(clip);

  const sceneTransitions = emitSceneTransitions(state);
  const timeline: Timeline = {
    schemaVersion: TIMELINE_SCHEMA_VERSION,
    fps,
    width: state.width,
    height: state.height,
    backgroundColor: "#000000",
    // The Export codec the owner picked — the render facade encodes with it.
    ...(state.codec ? { exportCodec: state.codec } : {}),
    tracks: [v1, v2, v3, a1, a2],
    // Every scene becomes a marker at its start frame. For video
    // projects these are chapter/cue points the editor can navigate to;
    // for podcast projects (#894 Phase 2) these are the timeline chapter
    // markers that the chapter editor (#907) reads/writes and the
    // future ID3-chapter export muxes into MP3/M4A files. ONE record,
    // ONE projection — no separate podcast-chapter array.
    markers: state.scenes.map((scene, idx) => ({
      id: scene.id,
      frame: sceneStartFrame(state, idx, fps),
      label: scene.label,
    })),
    // Whole-frame scene transitions (#570) — rendered by the shared frame
    // compositor for the preview overlay AND every export engine.
    ...(sceneTransitions.length > 0 ? { sceneTransitions } : {}),
  };
  return timeline;
}

function sceneStartFrame(state: CanvasState, index: number, fps: number): number {
  let start = 0;
  for (let i = 0; i < index; i++) {
    start += Math.max(1, Math.round(state.scenes[i].durationSeconds * fps));
  }
  return start;
}

/**
 * Best-effort reverse: read a Timeline that was authored by the v2
 * editor (recognizable by `canvas-v2:*` effect kinds) and reconstruct
 * CanvasState. Timelines authored elsewhere (NLE imports, sizzle-reel
 * emitter) fall back to an empty canvas — the user can still open them
 * via the legacy editor.
 */
export function timelineToCanvasState(timeline: unknown): CanvasState {
  if (!isTimeline(timeline)) return emptyCanvasState();
  const fps = timeline.fps;
  const v1 = timeline.tracks.find((t) => t.id === "v1") ?? timeline.tracks[0];
  const v3 = timeline.tracks.find((t) => t.id === "v3");
  // Every overlay clip, v2 first then legacy `widget-<id>` tracks, deduped
  // by clip id (timeline-widget-emit.ts).
  const widgetClips = collectWidgetClips(timeline);

  const scenes: Scene[] = [];
  const v1Clips = (v1?.clips ?? []).slice().sort((a, b) => a.startFrame - b.startFrame);

  for (const bg of v1Clips) {
    const bgEffect = bg.effects?.find((e) => e.kind === "canvas-v2:background");
    const params = bgEffect?.params ?? {};
    const sceneId = stringOr(params.sceneId, bg.id);
    const colorRaw = stringOr(params.color, "#0f172a");
    const overlay = widgetClips.filter(
      (c) =>
        c.startFrame >= bg.startFrame &&
        c.startFrame + c.durationFrames <= bg.startFrame + bg.durationFrames,
    );
    // Hydrate v1-preserved fields stored alongside the background
    // effect by `canvasStateToTimeline` (gap #611). The shapes are
    // accepted verbatim — they live on the Scene model already, so
    // a round-trip-then-edit doesn't drop them.
    const sourceSceneType =
      typeof params.sourceSceneType === "string"
        ? (params.sourceSceneType as Scene["sourceSceneType"])
        : undefined;
    const sourceEnterAnimations =
      params.sourceEnterAnimations && typeof params.sourceEnterAnimations === "object"
        ? (params.sourceEnterAnimations as Scene["sourceEnterAnimations"])
        : undefined;
    // Scene-level post-effects now live on the v3 ("Scene post") track
    // as a sourceless clip whose `effects` array IS the scene effect
    // chain. Match by overlap with this scene's bg clip frame range.
    // (Legacy timelines that stashed effects under `params.sceneEffects`
    // are tolerated below as a fallback.)
    const v3Clip = v3?.clips.find(
      (c) =>
        c.startFrame >= bg.startFrame &&
        c.startFrame + c.durationFrames <= bg.startFrame + bg.durationFrames,
    );
    // The render-only scene grade (#583) is not a scene effect — `filters`
    // round-trips through `sceneFilters` below.
    const v3Effects = (v3Clip?.effects ?? []).filter((e) => e.kind !== SCENE_GRADE_EFFECT);
    const sceneEffects: Scene["effects"] | undefined =
      v3Effects.length > 0
        ? v3Effects.map((e) => ({ kind: e.kind, params: e.params ?? {} }))
        : Array.isArray(params.sceneEffects)
          ? (params.sceneEffects as Scene["effects"])
          : undefined;
    const sceneFilters =
      params.sceneFilters && typeof params.sceneFilters === "object"
        ? (params.sceneFilters as Scene["filters"])
        : null;
    const transitionIn =
      typeof params.transitionIn === "string"
        ? (params.transitionIn as NonNullable<Scene["transitionIn"]>)
        : undefined;
    const backgroundEffect =
      typeof params.backgroundEffect === "string" ? params.backgroundEffect : undefined;
    const directorNotes =
      typeof params.directorNotes === "string" && params.directorNotes.length > 0
        ? params.directorNotes
        : undefined;
    scenes.push({
      id: sceneId,
      label:
        stringOr(params.label, "") ||
        timeline.markers?.find((m) => m.id === sceneId)?.label ||
        `Scene ${scenes.length + 1}`,
      durationSeconds: bg.durationFrames / fps,
      backgroundColor: colorRaw,
      widgets: overlay.map((c) => clipToWidget(c, bg.startFrame, fps)).filter(isWidget),
      filters: sceneFilters,
      ...(backgroundEffect ? { backgroundEffect } : {}),
      ...(sourceSceneType ? { sourceSceneType } : {}),
      ...(sourceEnterAnimations ? { sourceEnterAnimations } : {}),
      ...(sceneEffects && sceneEffects.length > 0 ? { effects: sceneEffects } : {}),
      ...(transitionIn ? { transitionIn } : {}),
      ...(directorNotes ? { directorNotes } : {}),
    });
  }

  if (scenes.length === 0) {
    return emptyCanvasState({ width: timeline.width, height: timeline.height, fps });
  }
  // Audio + mix recover. The full `audioLayers[]` snapshot AND the mix
  // were stashed on the first scene's background effect params on emit,
  // so the editor round-trip is lossless — trims, fades, splits, multiple
  // music beds, and pending-synthesis voiceover scripts all survive. Fall
  // back to reconstructing layers from the a1 (music/sfx) + a2 (voiceover)
  // render clips for timelines authored before the snapshot existed.
  const firstBgParams = (v1Clips[0]?.effects?.find((e) => e.kind === "canvas-v2:background")?.params ?? {});
  const audioMix =
    firstBgParams.audioMix && typeof firstBgParams.audioMix === "object"
      ? (firstBgParams.audioMix as CanvasState["audioMix"])
      : null;
  const audioLayers: AudioLayer[] = Array.isArray(firstBgParams.audioLayers)
    ? buildAudioLayers({ audioLayers: firstBgParams.audioLayers })
    : recoverAudioLayersFromClips(timeline, fps);

  return {
    schemaVersion: CANVAS_STATE_VERSION,
    width: timeline.width,
    height: timeline.height,
    fps,
    scenes,
    themeId: null,
    audioLayers,
    captions: null,
    audioMix,
    // Project-level styling fields default to null on hydrate — Timeline
    // JSON doesn't carry them across the round-trip yet (gap #561 +
    // #571–575). Re-applied from localStorage autosave if present.
    codec: timeline.exportCodec ?? null,
    motion: null,
    defaultTransition: null,
    fontFamily: null,
    colorPalette: null,
  };
}

function isTimeline(value: unknown): value is Timeline {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as Timeline).tracks) &&
    typeof (value as Timeline).fps === "number"
  );
}
