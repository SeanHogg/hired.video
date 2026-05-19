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
  CANVAS_STATE_VERSION,
  type CanvasState,
  type ChromaKeyParams,
  emptyCanvasState,
  type Scene,
  type Widget,
} from "./canvas-state";
import {
  computeDuckingSegments,
  type DuckingInterval,
} from "./audio-ducking";
import { isLinkedContentKind } from "./linked-content";
import {
  resolveMusic,
  resolvePlayableSrc,
  type MusicSource,
} from "../music-catalog";
import {
  TIMELINE_SCHEMA_VERSION,
  defaultTrack,
  type Clip,
  type ClipEffect,
  type MediaSource,
  type Timeline,
  type Track,
} from "@shared/timeline";

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
export function canvasStateToTimeline(state: CanvasState): Timeline {
  const fps = state.fps;
  let cursor = 0;

  const v1: Track = defaultTrack({ id: "v1", kind: "video", label: "Background" });
  // `v2` ("widgets") carries every overlay clip in the composition.
  // The renderer iterates every active clip on it per frame, in array
  // order, so we sort the clips by z before final assembly.
  const v2: Track = defaultTrack({ id: "v2", kind: "video", label: "Widgets" });
  // `v3` ("scene-post") sits ABOVE the widget track so its sourceless
  // clips' effects run after every widget has been composited — that's
  // what lets scene-level blur / glow / vignette / film-grain see the
  // full frame instead of just the bg. Adding a clip is `{startFrame,
  // durationFrames, effects: scene.effects}` with no source draw.
  const v3: Track = defaultTrack({ id: "v3", kind: "video", label: "Scene post" });
  const a1: Track = defaultTrack({ id: "a1", kind: "audio", label: "A1" });
  const a2: Track = defaultTrack({ id: "a2", kind: "audio", label: "A2" });
  // Collect widget clips with their z so we can sort them globally
  // before pushing into v2 (paint order = clip-array order).
  const widgetEntries: Array<{ clip: Clip; z: number }> = [];

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
          },
        },
      ],
    });

    for (const widget of scene.widgets) {
      const clip = widgetToClip(widget, cursor, sceneFrames, fps);
      if (!clip) continue;
      widgetEntries.push({ clip, z: widget.position.z });
    }

    // Scene-level post-effects ride on v3 (sourceless clip with the
    // effect chain) so the compositor runs them AFTER all widgets are
    // drawn — full-frame ops (blur / glow / vignette / film-grain /
    // chromatic-aberration / sharpen / glitch) see the composite, not
    // just the bg. Skip emitting a v3 clip when the scene has no
    // effects so the timeline stays minimal.
    if (scene.effects && scene.effects.length > 0) {
      v3.clips.push({
        id: `${scene.id}_post`,
        sourceId: "",
        startFrame: cursor,
        durationFrames: sceneFrames,
        sourceInFrame: 0,
        effects: scene.effects.map((e) => ({ kind: e.kind, params: e.params ?? {} })),
      });
    }

    cursor += sceneFrames;
  }

  // Music track lays one OR MORE clips across the full composition on
  // A1, depending on the audioMix ducking config. Source is
  // `music:<selectionId>` for both stock + custom — the render facade
  // resolves the URL via the MediaSource map populated separately
  // (gap-registered). resolveMusic() is the SINGLE seam between music
  // source state and any playable representation; consumers don't
  // re-derive playable URLs.
  //
  // Audio mix (#645) — master gain + per-lane gain / mute. Fold the
  // user-configured music slice into the clip's `gain` so the render
  // facade (which already honours per-clip gain) plays the mixed
  // output verbatim. The full mix shape is also stashed on the first
  // background clip's params so a save → load round-trip preserves
  // master / voiceover-lane settings the music clip alone can't express.
  //
  // Ducking: when `mix.duckMusicUnderVoiceover` is true, the shared
  // `computeDuckingSegments` helper splits the full-composition span
  // into open / ducked segments based on the voiceovers' time
  // windows. We emit one Clip per segment so the render facade hears
  // the right gain at every moment — same data the preview path uses
  // via `canvas-state-to-clips.ts`, single SSoT for the segment math.
  const mix = state.audioMix;
  const musicLaneGain = mix
    ? (mix.musicMuted ? 0 : mix.masterGain * mix.musicGain)
    : 0.6;
  const resolvedMusic = resolveMusic(state.musicSource);
  if (resolvedMusic && cursor > 0 && musicLaneGain > 0) {
    const totalSec = cursor / fps;
    const voiceoverIntervals: DuckingInterval[] = state.voiceovers
      .filter((vo) => !(mix?.voiceoverMuted) && !vo.muted)
      .map((vo) => {
        const anchorIdx = vo.anchorSceneId
          ? state.scenes.findIndex((s) => s.id === vo.anchorSceneId)
          : 0;
        const startFrame = anchorIdx >= 0 ? sceneStartFrame(state, anchorIdx, fps) : 0;
        return {
          startSec: startFrame / fps,
          endSec: startFrame / fps + vo.durationSeconds,
        };
      });
    const segments = computeDuckingSegments(totalSec, voiceoverIntervals, {
      enabled: Boolean(mix?.duckMusicUnderVoiceover),
      duckAmount: mix?.duckAmount,
    });
    segments.forEach((seg, i) => {
      const startFrame = Math.round(seg.startSec * fps);
      const endFrame = Math.round(seg.endSec * fps);
      const durationFrames = Math.max(1, endFrame - startFrame);
      a1.clips.push({
        id:
          segments.length === 1
            ? `music_${resolvedMusic.selectionId}`
            : `music_${resolvedMusic.selectionId}_${i}`,
        sourceId: `music:${resolvedMusic.selectionId}`,
        startFrame,
        durationFrames,
        // Each segment seeks into the same source at its own start
        // offset so the music isn't restarted at each segment edge —
        // it continues uninterrupted under the duck.
        sourceInFrame: startFrame,
        gain: musicLaneGain * seg.gainMultiplier,
      });
    });
  }
  // Voiceover clips lay sequentially on A2 with their per-clip gain
  // composed with master × voiceover-lane. Anchor scene id (when set)
  // picks the clip's start frame; otherwise it starts at 0.
  for (const vo of state.voiceovers) {
    const anchorIdx = vo.anchorSceneId
      ? state.scenes.findIndex((s) => s.id === vo.anchorSceneId)
      : 0;
    const startFrame = anchorIdx >= 0 ? sceneStartFrame(state, anchorIdx, fps) : 0;
    const clipFrames = Math.max(1, Math.round(vo.durationSeconds * fps));
    const clipGain = mix
      ? (mix.voiceoverMuted || vo.muted
          ? 0
          : mix.masterGain * mix.voiceoverGain * (vo.gain ?? 1))
      : vo.muted
        ? 0
        : (vo.gain ?? 1);
    a2.clips.push({
      id: vo.id,
      sourceId: vo.url,
      startFrame,
      durationFrames: clipFrames,
      sourceInFrame: 0,
      gain: clipGain,
      // Stash the un-composed per-clip values so timelineToCanvasState
      // can hydrate `voiceovers[].gain` / `.muted` back unchanged.
      effects: [
        {
          kind: "canvas-v2:voiceover-meta",
          params: {
            anchorSceneId: vo.anchorSceneId,
            label: vo.label,
            gain: vo.gain ?? 1,
            muted: Boolean(vo.muted),
          },
        },
      ],
    });
  }

  // Sort widget clips by z and push into v2 so the renderer paints
  // lower-z first and higher-z on top — same compositing order
  // CanvasStage uses via CSS z-index. Two widgets in different scenes
  // never share a frame (scenes are sequential), so a stable global
  // sort is sufficient.
  widgetEntries.sort((a, b) => a.z - b.z);
  for (const { clip } of widgetEntries) v2.clips.push(clip);

  const timeline: Timeline = {
    schemaVersion: TIMELINE_SCHEMA_VERSION,
    fps,
    width: state.width,
    height: state.height,
    backgroundColor: "#000000",
    tracks: [v1, v2, v3, a1, a2],
    markers: state.scenes.map((scene, idx) => ({
      id: scene.id,
      frame: sceneStartFrame(state, idx, fps),
      label: scene.label,
    })),
  };
  return timeline;
}

/**
 * Build the `Record<sourceId, MediaSource>` map the Timeline renderer's
 * audio mixer needs. The Timeline JSON itself only carries opaque
 * `sourceId` strings on audio clips (`music:<selectionId>` for the
 * music lane and the raw voiceover URL for the voiceover lane) —
 * resolving each id to a playable URL is this helper's job. Async
 * because stock-music selections may need procedural rendering on
 * first use. Single source of truth so every render entry point
 * (export, publish, future server worker) constructs the same map.
 */
export async function resolveTimelineAudioSources(
  state: CanvasState,
): Promise<Record<string, MediaSource>> {
  const sources: Record<string, MediaSource> = {};
  const fps = state.fps;
  const uploadedAt = new Date(0).toISOString();

  const resolvedMusic = resolveMusic(state.musicSource);
  if (resolvedMusic) {
    const url = await resolvePlayableSrc(state.musicSource);
    if (url) {
      const sourceId = `music:${resolvedMusic.selectionId}`;
      sources[sourceId] = {
        id: sourceId,
        kind: "audio",
        url,
        proxyUrl: null,
        durationFrames: 0,
        fps,
        width: null,
        height: null,
        filename: resolvedMusic.label,
        uploadedAt,
      };
    }
  }

  for (const vo of state.voiceovers) {
    if (!vo.url || sources[vo.url]) continue;
    sources[vo.url] = {
      id: vo.url,
      kind: "audio",
      url: vo.url,
      proxyUrl: null,
      durationFrames: Math.max(1, Math.round(vo.durationSeconds * fps)),
      fps,
      width: null,
      height: null,
      filename: vo.label || "voiceover",
      uploadedAt,
    };
  }

  return sources;
}

function sceneStartFrame(state: CanvasState, index: number, fps: number): number {
  let start = 0;
  for (let i = 0; i < index; i++) {
    start += Math.max(1, Math.round(state.scenes[i].durationSeconds * fps));
  }
  return start;
}

function widgetToClip(
  widget: Widget,
  sceneStart: number,
  sceneFrames: number,
  fps: number,
): Clip | null {
  const from = widget.visibleFrom !== null
    ? Math.max(0, Math.round(widget.visibleFrom * fps))
    : 0;
  const to = widget.visibleTo !== null
    ? Math.min(sceneFrames, Math.round(widget.visibleTo * fps))
    : sceneFrames;
  if (to <= from) return null;

  return {
    id: widget.id,
    sourceId: "",
    startFrame: sceneStart + from,
    durationFrames: to - from,
    sourceInFrame: 0,
    effects: [widgetToEffect(widget)],
  };
}

function widgetToEffect(widget: Widget): ClipEffect {
  const rect = {
    x: widget.position.x,
    y: widget.position.y,
    width: widget.position.width,
    height: widget.position.height,
    z: widget.position.z,
    rotation: widget.position.rotation,
    // Motion travels with the widget on the same effect so the renderer
    // can apply enter / exit to the clip's local timeline without a
    // second lookup. `null` means no motion (default).
    motion: widget.motion,
    // Container chrome (bg / border / radius / padding) — applied
    // uniformly across widget kinds. Omitted when the widget has no
    // styling so the persisted payload stays minimal.
    containerStyle: widget.containerStyle,
    // Per-widget visual effect chain (drop shadow, glow, blur, etc) —
    // same `{kind, params}` registry shape v1 uses on SceneEffect.
    effects: widget.effects,
  };
  const p = widget.params;
  switch (p.kind) {
    case "text":
    case "heading":
      return {
        kind: "canvas-v2:text",
        params: {
          ...rect,
          text: p.data.text,
          fontPx: p.data.fontPx,
          color: p.data.color,
          fontWeight: p.data.fontWeight,
          align: p.data.align,
          background: p.data.background,
          isHeading: p.kind === "heading",
        },
      };
    case "image": {
      const url = p.data.source.kind === "url" ? p.data.source.url : "";
      return {
        kind: "canvas-v2:image",
        params: {
          ...rect,
          url,
          sourceId: p.data.source.kind === "sourceId" ? p.data.source.id : "",
          fit: p.data.fit,
        },
      };
    }
    case "video": {
      const url = p.data.source.kind === "url" ? p.data.source.url : "";
      return {
        kind: "canvas-v2:video",
        params: {
          ...rect,
          url,
          sourceId: p.data.source.kind === "sourceId" ? p.data.source.id : "",
          muted: p.data.muted,
          // Chroma-key — typed video-widget field that the
          // canvas-v2:video applier reads + synthesises into a
          // `chroma-key` effect for the pixel pass. Omitted when null
          // so the round-trip payload stays minimal.
          ...(p.data.chromaKey ? { chromaKey: p.data.chromaKey } : {}),
        },
      };
    }
    case "shape-rect":
      return {
        kind: "canvas-v2:shape-rect",
        params: {
          ...rect,
          fill: p.data.fill,
          strokeColor: p.data.strokeColor,
          strokeWidth: p.data.strokeWidth,
          cornerRadius: p.data.cornerRadius,
        },
      };
    case "shape-circle":
      return {
        kind: "canvas-v2:shape-circle",
        params: {
          ...rect,
          fill: p.data.fill,
          strokeColor: p.data.strokeColor,
          strokeWidth: p.data.strokeWidth,
        },
      };
    case "divider":
      return {
        kind: "canvas-v2:divider",
        params: {
          ...rect,
          color: p.data.color,
          thickness: p.data.thickness,
        },
      };
    case "chart":
      return {
        kind: "canvas-v2:chart",
        params: {
          ...rect,
          chartType: p.data.chartType,
          data: p.data.data,
          format: p.data.format ?? "csv",
          title: p.data.title ?? "",
          takeaway: p.data.takeaway ?? "",
          colors: p.data.colors ?? [],
        },
      };
    case "webcam":
      return {
        kind: "canvas-v2:webcam",
        params: {
          ...rect,
          recordingUrl: p.data.recordingUrl ?? "",
          mirror: !!p.data.mirror,
          muted: !!p.data.muted,
        },
      };
    case "chips":
      return {
        kind: "canvas-v2:chips",
        params: {
          ...rect,
          chips: p.data.chips,
          fontPx: p.data.fontPx,
          fontFamily: p.data.fontFamily ?? "",
          chipColor: p.data.chipColor,
          textColor: p.data.textColor,
          direction: p.data.direction,
        },
      };
    case "cta":
      return {
        kind: "canvas-v2:cta",
        params: {
          ...rect,
          headline: p.data.headline,
          subheadline: p.data.subheadline ?? "",
          ctaText: p.data.ctaText,
          ctaUrl: p.data.ctaUrl,
          bgColor: p.data.bgColor,
          textColor: p.data.textColor,
          accentColor: p.data.accentColor,
          accentTextColor: p.data.accentTextColor,
          ...(p.data.cardFontPx !== undefined ? { cardFontPx: p.data.cardFontPx } : {}),
          ...(p.data.ctaFontPx !== undefined ? { ctaFontPx: p.data.ctaFontPx } : {}),
        },
      };
    case "linked-content":
      return {
        kind: "canvas-v2:linked-content",
        params: {
          ...rect,
          entityKind: p.data.entityKind,
          entityId: p.data.entityId,
          // Per-widget colours are stamped from the active theme at
          // insert time + on every `applyThemeToState` walk; the
          // round-trip carries them verbatim so re-opening a saved
          // project preserves the user-seen styling without re-running
          // theme application on load.
          ...(p.data.bgColor !== undefined ? { bgColor: p.data.bgColor } : {}),
          ...(p.data.textColor !== undefined ? { textColor: p.data.textColor } : {}),
          ...(p.data.mutedColor !== undefined ? { mutedColor: p.data.mutedColor } : {}),
          ...(p.data.accentColor !== undefined ? { accentColor: p.data.accentColor } : {}),
          ...(p.data.accentTextColor !== undefined
            ? { accentTextColor: p.data.accentTextColor }
            : {}),
        },
      };
  }
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
  // Widgets live on the `v2` track — one track for every overlay
  // clip in the composition. Paint order = clip-array order, baked in
  // by `canvasStateToTimeline` (which sorts by z before emit). The
  // renderer iterates every active clip on `v2` per frame via
  // `activeClipsAt`, so simultaneous widgets all draw.
  const v2 = timeline.tracks.find((t) => t.id === "v2" && t.kind === "video");
  const widgetClips = v2?.clips ?? [];

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
    const sceneEffects: Scene["effects"] | undefined =
      v3Clip?.effects && v3Clip.effects.length > 0
        ? v3Clip.effects.map((e) => ({ kind: e.kind, params: e.params ?? {} }))
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
  // Recover the chosen music from the audio track's clip sourceId. Stock
  // selections re-resolve cleanly (the id matches a MUSIC_TRACKS entry);
  // custom selections lose their URL on round-trip here because the
  // Timeline doesn't carry it — full custom-music round-trip is
  // gap-registered.
  const a1 = timeline.tracks.find((t) => t.id === "a1");
  const musicClip = a1?.clips.find((c) => c.sourceId.startsWith("music:"));
  const musicSelectionId = musicClip
    ? musicClip.sourceId.slice("music:".length)
    : null;
  const musicSource: MusicSource | null =
    musicSelectionId && !musicSelectionId.startsWith("custom:")
      ? { kind: "stock", trackId: musicSelectionId }
      : null;

  // Audio mix + voiceovers (#645). The mix was stashed on the first
  // scene's background effect params on emit; voiceover clips ride on
  // a2 with their per-clip gain/muted preserved by a sidecar
  // `canvas-v2:voiceover-meta` effect.
  const firstBgParams = (v1Clips[0]?.effects?.find((e) => e.kind === "canvas-v2:background")?.params ?? {}) as Record<string, unknown>;
  const audioMix =
    firstBgParams.audioMix && typeof firstBgParams.audioMix === "object"
      ? (firstBgParams.audioMix as CanvasState["audioMix"])
      : null;
  const a2 = timeline.tracks.find((t) => t.id === "a2");
  const voiceovers: VoiceoverClipShape[] = (a2?.clips ?? []).map((c) => {
    const meta = (c.effects?.find((e) => e.kind === "canvas-v2:voiceover-meta")?.params ?? {}) as Record<string, unknown>;
    return {
      id: c.id,
      url: c.sourceId,
      durationSeconds: c.durationFrames / fps,
      anchorSceneId:
        typeof meta.anchorSceneId === "string" ? meta.anchorSceneId : null,
      label: stringOr(meta.label, "Voiceover"),
      gain: typeof meta.gain === "number" ? meta.gain : (c.gain ?? 1),
      muted: meta.muted === true,
    };
  });

  return {
    schemaVersion: CANVAS_STATE_VERSION,
    width: timeline.width,
    height: timeline.height,
    fps,
    scenes,
    themeId: null,
    musicSource,
    captions: null,
    voiceovers,
    audioMix,
    // Project-level styling fields default to null on hydrate — Timeline
    // JSON doesn't carry them across the round-trip yet (gap #561 +
    // #571–575). Re-applied from localStorage autosave if present.
    codec: null,
    motion: null,
    defaultTransition: null,
    fontFamily: null,
    colorPalette: null,
  };
}

type VoiceoverClipShape = import("./canvas-state").VoiceoverClip;

function clipToWidget(clip: Clip, sceneStart: number, fps: number): Widget | null {
  const effect = clip.effects?.[0];
  if (!effect?.kind.startsWith("canvas-v2:")) return null;
  const params = effect.params;

  const base: Pick<
    Widget,
    | "id"
    | "position"
    | "visibleFrom"
    | "visibleTo"
    | "motion"
    | "containerStyle"
    | "effects"
  > = {
    id: clip.id,
    position: {
      x: numberOr(params.x, 0.1),
      y: numberOr(params.y, 0.1),
      width: numberOr(params.width, 0.3),
      height: numberOr(params.height, 0.1),
      z: numberOr(params.z, 1),
      rotation: numberOr(params.rotation, 0),
    },
    visibleFrom: (clip.startFrame - sceneStart) / fps,
    visibleTo: (clip.startFrame - sceneStart + clip.durationFrames) / fps,
    motion: isWidgetMotion(params.motion) ? params.motion : null,
    containerStyle: isContainerStyle(params.containerStyle)
      ? params.containerStyle
      : undefined,
    effects: isEffectStack(params.effects) ? params.effects : undefined,
  };

  switch (effect.kind) {
    case "canvas-v2:text": {
      const isHeading = params.isHeading === true;
      return {
        ...base,
        kind: isHeading ? "heading" : "text",
        params: {
          kind: isHeading ? "heading" : "text",
          data: {
            text: stringOr(params.text, "Your text here"),
            fontPx: numberOr(params.fontPx, 32),
            color: stringOr(params.color, "#ffffff"),
            fontWeight: stringOr(params.fontWeight, "normal") as "normal" | "bold",
            align: stringOr(params.align, "left") as "left" | "center" | "right",
            background: typeof params.background === "string" ? params.background : null,
          },
        },
      };
    }
    case "canvas-v2:image": {
      const sourceId = stringOr(params.sourceId, "");
      const url = stringOr(params.url, "");
      return {
        ...base,
        effects: liftLegacyAnimation(params, base.effects),
        kind: "image",
        params: {
          kind: "image",
          data: {
            source: sourceId ? { kind: "sourceId", id: sourceId } : { kind: "url", url },
            fit: stringOr(params.fit, "cover") as "cover" | "contain" | "stretch",
          },
        },
      };
    }
    case "canvas-v2:video": {
      const sourceId = stringOr(params.sourceId, "");
      const url = stringOr(params.url, "");
      const chromaKey = parseChromaKeyParams(params.chromaKey);
      return {
        ...base,
        effects: liftLegacyAnimation(params, base.effects),
        kind: "video",
        params: {
          kind: "video",
          data: {
            source: sourceId ? { kind: "sourceId", id: sourceId } : { kind: "url", url },
            muted: params.muted === true,
            ...(chromaKey ? { chromaKey } : {}),
          },
        },
      };
    }
    case "canvas-v2:shape-rect":
      return {
        ...base,
        kind: "shape-rect",
        params: {
          kind: "shape-rect",
          data: {
            fill: stringOr(params.fill, "#0ea5e9"),
            strokeColor: stringOr(params.strokeColor, "#ffffff"),
            strokeWidth: numberOr(params.strokeWidth, 0),
            cornerRadius: numberOr(params.cornerRadius, 8),
          },
        },
      };
    case "canvas-v2:shape-circle":
      return {
        ...base,
        kind: "shape-circle",
        params: {
          kind: "shape-circle",
          data: {
            fill: stringOr(params.fill, "#22c55e"),
            strokeColor: stringOr(params.strokeColor, "#ffffff"),
            strokeWidth: numberOr(params.strokeWidth, 0),
            cornerRadius: 0,
          },
        },
      };
    case "canvas-v2:divider":
      return {
        ...base,
        kind: "divider",
        params: {
          kind: "divider",
          data: {
            color: stringOr(params.color, "#ffffff"),
            thickness: numberOr(params.thickness, 2),
          },
        },
      };
    case "canvas-v2:chart":
      return {
        ...base,
        kind: "chart",
        params: {
          kind: "chart",
          data: {
            chartType: asChartType(params.chartType),
            data: stringOr(params.data, ""),
            format: asChartFormat(params.format),
            title: stringOr(params.title, ""),
            takeaway: stringOr(params.takeaway, ""),
            colors: Array.isArray(params.colors)
              ? (params.colors.filter((c): c is string => typeof c === "string"))
              : undefined,
          },
        },
      };
    case "canvas-v2:webcam":
      return {
        ...base,
        kind: "webcam",
        params: {
          kind: "webcam",
          data: {
            recordingUrl: stringOr(params.recordingUrl, "") || null,
            mirror: params.mirror !== false,
            muted: params.muted === true,
          },
        },
      };
    case "canvas-v2:chips":
      return {
        ...base,
        kind: "chips",
        params: {
          kind: "chips",
          data: {
            chips: Array.isArray(params.chips)
              ? (params.chips.filter((c): c is string => typeof c === "string"))
              : [],
            fontPx: numberOr(params.fontPx, 14),
            fontFamily: stringOr(params.fontFamily, "") || undefined,
            chipColor: stringOr(params.chipColor, "#1e293b"),
            textColor: stringOr(params.textColor, "#f1f5f9"),
            direction: params.direction === "column" ? "column" : "row",
          },
        },
      };
    case "canvas-v2:cta":
      return {
        ...base,
        kind: "cta",
        params: {
          kind: "cta",
          data: {
            headline: stringOr(params.headline, "Ready to get started?"),
            subheadline: stringOr(params.subheadline, "") || undefined,
            ctaText: stringOr(params.ctaText, "Learn more"),
            ctaUrl: stringOr(params.ctaUrl, ""),
            bgColor: stringOr(params.bgColor, "#0f172a"),
            textColor: stringOr(params.textColor, "#ffffff"),
            accentColor: stringOr(params.accentColor, "#a78bfa"),
            accentTextColor: stringOr(params.accentTextColor, "#0f172a"),
            ...(typeof params.cardFontPx === "number" ? { cardFontPx: params.cardFontPx } : {}),
            ...(typeof params.ctaFontPx === "number" ? { ctaFontPx: params.ctaFontPx } : {}),
          },
        },
      };
    case "canvas-v2:linked-content": {
      const entityKindRaw = stringOr(params.entityKind, "resume");
      const entityKind = isLinkedContentKind(entityKindRaw)
        ? entityKindRaw
        : "resume";
      return {
        ...base,
        kind: "linked-content",
        params: {
          kind: "linked-content",
          data: {
            entityKind,
            entityId: stringOr(params.entityId, ""),
            ...(typeof params.bgColor === "string" ? { bgColor: params.bgColor } : {}),
            ...(typeof params.textColor === "string" ? { textColor: params.textColor } : {}),
            ...(typeof params.mutedColor === "string" ? { mutedColor: params.mutedColor } : {}),
            ...(typeof params.accentColor === "string" ? { accentColor: params.accentColor } : {}),
            ...(typeof params.accentTextColor === "string"
              ? { accentTextColor: params.accentTextColor }
              : {}),
          },
        },
      };
    }
    default:
      return null;
  }
}

function asChartType(value: unknown): import("./canvas-state").ChartWidgetParams["chartType"] {
  if (value === "bar" || value === "line" || value === "pie" || value === "scatter") {
    return value;
  }
  return "bar";
}

function asChartFormat(value: unknown): "csv" | "tsv" | "json" | undefined {
  if (value === "csv" || value === "tsv" || value === "json") return value;
  return undefined;
}

function isContainerStyle(
  value: unknown,
): value is import("./canvas-state").ContainerStyle {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  // Every field is optional; just confirm at least one valid key is
  // present + that any present keys carry the right primitive type.
  const checks: Array<[string, "string" | "number"]> = [
    ["backgroundColor", "string"],
    ["borderColor", "string"],
    ["borderWidth", "number"],
    ["borderRadius", "number"],
    ["padding", "number"],
  ];
  let hasAny = false;
  for (const [k, t] of checks) {
    if (v[k] === undefined) continue;
    if (typeof v[k] !== t) return false;
    hasAny = true;
  }
  return hasAny;
}

function isEffectStack(
  value: unknown,
): value is Array<{ kind: string; params: Record<string, unknown> }> {
  if (!Array.isArray(value)) return false;
  return value.every(
    (entry) =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as { kind?: unknown }).kind === "string",
  );
}

/** Lift the legacy `params.animation` Ken-Burns prop (image/video
 *  only, pre-gap-#659 saves) into the modern `effects` chain as an
 *  `animate-*` entry. Single seam called by the image/video hydration
 *  paths so render-side, editor preview, and legacy data all converge
 *  on the same effect-array representation — no parallel motion paths.
 *
 *  If the chain already has an animate-* effect, the legacy prop is
 *  ignored: explicit user choice wins over the legacy shortcut. */
function liftLegacyAnimation(
  params: Record<string, unknown>,
  existing: Array<{ kind: string; params: Record<string, unknown> }> | undefined,
): Array<{ kind: string; params: Record<string, unknown> }> | undefined {
  const legacy = typeof params.animation === "string" ? params.animation : "";
  if (legacy === "" || legacy === "none") return existing;
  const allowed = new Set(["zoom-in", "zoom-out", "pan-left", "pan-right"]);
  if (!allowed.has(legacy)) return existing;
  const kind = `animate-${legacy}`;
  const arr = existing ? existing.slice() : [];
  if (arr.some((e) => e.kind === kind)) return existing;
  arr.unshift({ kind, params: {} });
  return arr;
}

function isTimeline(value: unknown): value is Timeline {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as Timeline).tracks) &&
    typeof (value as Timeline).fps === "number"
  );
}

function isWidget(value: Widget | null): value is Widget {
  return value !== null;
}

function isWidgetMotion(value: unknown): value is import("./widget-motion").WidgetMotion {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { enter?: unknown; exit?: unknown };
  return isMotionPhase(v.enter) && isMotionPhase(v.exit);
}

function isMotionPhase(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { kind?: unknown; durationSeconds?: unknown; easing?: unknown };
  return typeof v.kind === "string" && typeof v.durationSeconds === "number" && typeof v.easing === "string";
}

function numberOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function stringOr(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

/** Parse a saved `chromaKey` blob into a `ChromaKeyParams` shape, or
 *  null when the data is missing / malformed. `keyColor` is the only
 *  required field; the rest fall back to the standard defaults so a
 *  partial save still produces a usable key. */
function parseChromaKeyParams(value: unknown): ChromaKeyParams | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.keyColor !== "string") return null;
  return {
    keyColor: v.keyColor,
    threshold: typeof v.threshold === "number" ? v.threshold : 0.4,
    softness: typeof v.softness === "number" ? v.softness : 0.1,
    ...(typeof v.spillSuppression === "number"
      ? { spillSuppression: v.spillSuppression }
      : {}),
  };
}
