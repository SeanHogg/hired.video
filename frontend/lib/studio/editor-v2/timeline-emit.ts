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
  emptyCanvasState,
  type Scene,
  type Widget,
} from "./canvas-state";
import { resolveMusic, type MusicSource } from "../music-catalog";
import {
  TIMELINE_SCHEMA_VERSION,
  defaultTrack,
  type Clip,
  type ClipEffect,
  type Timeline,
  type Track,
} from "@shared/timeline";

/**
 * Emit a Timeline JSON document from canvas state. Each scene becomes a
 * background clip on V1 (sourceless, just a `canvas-v2:background`
 * effect) plus one overlay clip per widget on V2.
 */
export function canvasStateToTimeline(state: CanvasState): Timeline {
  const fps = state.fps;
  let cursor = 0;

  const v1: Track = defaultTrack({ id: "v1", kind: "video", label: "Background" });
  const v2: Track = defaultTrack({ id: "v2", kind: "video", label: "Widgets" });
  const a1: Track = defaultTrack({ id: "a1", kind: "audio", label: "A1" });
  const a2: Track = defaultTrack({ id: "a2", kind: "audio", label: "A2" });

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
            ...(scene.sourceSceneType ? { sourceSceneType: scene.sourceSceneType } : {}),
            ...(scene.sourceEnterAnimations
              ? { sourceEnterAnimations: scene.sourceEnterAnimations }
              : {}),
            ...(scene.effects && scene.effects.length > 0 ? { sceneEffects: scene.effects } : {}),
            ...(scene.filters ? { sceneFilters: scene.filters } : {}),
            ...(scene.transitionIn ? { transitionIn: scene.transitionIn } : {}),
          },
        },
      ],
    });

    for (const widget of scene.widgets) {
      const clip = widgetToClip(widget, cursor, sceneFrames, fps);
      if (clip) v2.clips.push(clip);
    }

    cursor += sceneFrames;
  }

  // Music track lays a single clip across the full composition on A1.
  // Source is `music:<selectionId>` for both stock + custom — the render
  // facade resolves the URL via the MediaSource map populated separately
  // (gap-registered). resolveMusic() is the SINGLE seam between music
  // source state and any playable representation; consumers don't
  // re-derive playable URLs.
  const resolvedMusic = resolveMusic(state.musicSource);
  if (resolvedMusic && cursor > 0) {
    a1.clips.push({
      id: `music_${resolvedMusic.selectionId}`,
      sourceId: `music:${resolvedMusic.selectionId}`,
      startFrame: 0,
      durationFrames: cursor,
      sourceInFrame: 0,
      gain: 0.6,
    });
  }

  const timeline: Timeline = {
    schemaVersion: TIMELINE_SCHEMA_VERSION,
    fps,
    width: state.width,
    height: state.height,
    backgroundColor: "#000000",
    tracks: [v1, v2, a1, a2],
    markers: state.scenes.map((scene, idx) => ({
      id: scene.id,
      frame: sceneStartFrame(state, idx, fps),
      label: scene.label,
    })),
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
          animation: p.data.animation ?? "none",
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
          animation: p.data.animation ?? "none",
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
  const v2 = timeline.tracks.find((t) => t.id === "v2");

  const scenes: Scene[] = [];
  const v1Clips = (v1?.clips ?? []).slice().sort((a, b) => a.startFrame - b.startFrame);

  for (const bg of v1Clips) {
    const bgEffect = bg.effects?.find((e) => e.kind === "canvas-v2:background");
    const params = bgEffect?.params ?? {};
    const sceneId = stringOr(params.sceneId, bg.id);
    const colorRaw = stringOr(params.color, "#0f172a");
    const overlay = (v2?.clips ?? []).filter(
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
    const sceneEffects = Array.isArray(params.sceneEffects)
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
      ...(sourceSceneType ? { sourceSceneType } : {}),
      ...(sourceEnterAnimations ? { sourceEnterAnimations } : {}),
      ...(sceneEffects && sceneEffects.length > 0 ? { effects: sceneEffects } : {}),
      ...(transitionIn ? { transitionIn } : {}),
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
  return {
    schemaVersion: CANVAS_STATE_VERSION,
    width: timeline.width,
    height: timeline.height,
    fps,
    scenes,
    themeId: null,
    musicSource,
    captions: null,
    voiceovers: [],
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
        kind: "image",
        params: {
          kind: "image",
          data: {
            source: sourceId ? { kind: "sourceId", id: sourceId } : { kind: "url", url },
            fit: stringOr(params.fit, "cover") as "cover" | "contain" | "stretch",
            animation: asAnimation(params.animation),
          },
        },
      };
    }
    case "canvas-v2:video": {
      const sourceId = stringOr(params.sourceId, "");
      const url = stringOr(params.url, "");
      return {
        ...base,
        kind: "video",
        params: {
          kind: "video",
          data: {
            source: sourceId ? { kind: "sourceId", id: sourceId } : { kind: "url", url },
            muted: params.muted === true,
            animation: asAnimation(params.animation),
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
          },
        },
      };
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

function asAnimation(value: unknown): import("./canvas-state").WidgetAnimation {
  if (
    value === "none" ||
    value === "zoom-in" ||
    value === "zoom-out" ||
    value === "pan-left" ||
    value === "pan-right"
  ) {
    return value;
  }
  return "none";
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
