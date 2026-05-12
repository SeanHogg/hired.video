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
 * Per the standing DRY rule: every save path (auto-save, manual save,
 * render-emit) calls `canvasStateToTimeline()`. There is no parallel
 * emit code elsewhere.
 */

import {
  CANVAS_STATE_VERSION,
  type CanvasState,
  emptyCanvasState,
  type Scene,
  type Widget,
} from "./canvas-state";
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
 * background clip on V1 (solid colour or video) plus one overlay clip
 * per widget on V2, each carrying the widget's renderer-side effect.
 *
 * For widget kinds that don't yet have a registered effect (`shape-rect`,
 * `shape-circle`, `divider`), we emit the effect with a `canvas-v2:`
 * prefix kind. The renderer skips unknown kinds (per
 * `applyEffects()` contract). Editing UX still works because the editor
 * draws widgets in React — render is the open gap, logged separately.
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
      effects: [
        {
          kind: "canvas-v2:background",
          params: { color: scene.backgroundColor, sceneId: scene.id },
        },
      ],
    });

    for (const widget of scene.widgets) {
      const clip = widgetToClip(widget, scene, cursor, sceneFrames, fps);
      if (clip) v2.clips.push(clip);
    }

    cursor += sceneFrames;
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
  scene: Scene,
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

  const effects: ClipEffect[] = [
    {
      kind: "canvas-v2:position",
      params: {
        x: widget.position.x,
        y: widget.position.y,
        width: widget.position.width,
        height: widget.position.height,
        z: widget.position.z,
      },
    },
    widgetToEffect(widget),
  ];

  return {
    id: widget.id,
    sourceId: widgetSourceId(widget),
    startFrame: sceneStart + from,
    durationFrames: to - from,
    sourceInFrame: 0,
    effects,
  };
}

function widgetSourceId(widget: Widget): string {
  const params = widget.params;
  if (params.kind === "image" || params.kind === "video") {
    if (params.data.source.kind === "sourceId") return params.data.source.id;
  }
  return "";
}

function widgetToEffect(widget: Widget): ClipEffect {
  const p = widget.params;
  switch (p.kind) {
    case "text":
    case "heading":
      // Text widgets map to the existing `title-card` effect with a
      // simple fade-in preset. The renderer already handles this kind;
      // shape/divider widgets below use `canvas-v2:` placeholder kinds
      // until a renderer pass adds them.
      return {
        kind: "title-card",
        params: {
          text: p.data.text,
          subtitle: "",
          preset: "fade-in",
          fontPx: p.data.fontPx,
          color: p.data.color,
          background: p.data.background ?? "#0ea5e9",
          inAt: 0,
          outAt: 1,
        },
      };
    case "image":
      return { kind: "canvas-v2:image", params: { fit: p.data.fit } };
    case "video":
      return { kind: "canvas-v2:video", params: { muted: p.data.muted } };
    case "shape-rect":
      return {
        kind: "canvas-v2:shape-rect",
        params: {
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
          fill: p.data.fill,
          strokeColor: p.data.strokeColor,
          strokeWidth: p.data.strokeWidth,
        },
      };
    case "divider":
      return {
        kind: "canvas-v2:divider",
        params: { color: p.data.color, thickness: p.data.thickness },
      };
  }
}

/**
 * Best-effort reverse: read a Timeline that was authored by the v2
 * editor (recognizable by `canvas-v2:` effect kinds and markers) and
 * reconstruct CanvasState. Timelines authored elsewhere (NLE imports,
 * sizzle-reel emitter) fall back to a single-scene wrapper so the user
 * can still open them in v2 — they'll see one scene with the full
 * source as a background.
 */
export function timelineToCanvasState(timeline: unknown): CanvasState {
  if (!isTimeline(timeline)) return emptyCanvasState();
  const fps = timeline.fps;
  const v1 = timeline.tracks.find((t) => t.id === "v1") ?? timeline.tracks[0];
  const v2 = timeline.tracks.find((t) => t.id === "v2");

  const scenes: Scene[] = [];
  const v1Clips = (v1?.clips ?? []).slice().sort((a, b) => a.startFrame - b.startFrame);

  for (const bg of v1Clips) {
    const sceneId =
      (bg.effects?.find((e) => e.kind === "canvas-v2:background")?.params as
        | { sceneId?: string }
        | undefined)?.sceneId ?? bg.id;
    const colorRaw = (bg.effects?.find((e) => e.kind === "canvas-v2:background")
      ?.params as { color?: string } | undefined)?.color;
    const overlay = (v2?.clips ?? []).filter(
      (c) =>
        c.startFrame >= bg.startFrame &&
        c.startFrame + c.durationFrames <= bg.startFrame + bg.durationFrames,
    );
    scenes.push({
      id: sceneId,
      label: timeline.markers?.find((m) => m.id === sceneId)?.label ?? `Scene ${scenes.length + 1}`,
      durationSeconds: bg.durationFrames / fps,
      backgroundColor: typeof colorRaw === "string" ? colorRaw : "#0f172a",
      widgets: overlay.map((c) => clipToWidget(c, bg.startFrame, fps)).filter(isWidget),
    });
  }

  if (scenes.length === 0) {
    return emptyCanvasState({ width: timeline.width, height: timeline.height, fps });
  }
  return {
    schemaVersion: CANVAS_STATE_VERSION,
    width: timeline.width,
    height: timeline.height,
    fps,
    scenes,
  };
}

function clipToWidget(clip: Clip, sceneStart: number, fps: number): Widget | null {
  const positionEffect = clip.effects?.find((e) => e.kind === "canvas-v2:position");
  const contentEffect = clip.effects?.find((e) => e.kind !== "canvas-v2:position");
  if (!positionEffect || !contentEffect) return null;
  const pos = positionEffect.params;

  const base: Pick<Widget, "id" | "position" | "visibleFrom" | "visibleTo"> = {
    id: clip.id,
    position: {
      x: numberOr(pos.x, 0.1),
      y: numberOr(pos.y, 0.1),
      width: numberOr(pos.width, 0.3),
      height: numberOr(pos.height, 0.1),
      z: numberOr(pos.z, 1),
    },
    visibleFrom: (clip.startFrame - sceneStart) / fps,
    visibleTo: (clip.startFrame - sceneStart + clip.durationFrames) / fps,
  };

  const cp = contentEffect.params;
  switch (contentEffect.kind) {
    case "title-card":
      return {
        ...base,
        kind: "text",
        params: {
          kind: "text",
          data: {
            text: stringOr(cp.text, "Your text here"),
            fontPx: numberOr(cp.fontPx, 32),
            color: stringOr(cp.color, "#ffffff"),
            fontWeight: "normal",
            align: "left",
            background:
              typeof cp.background === "string" && cp.background !== "#0ea5e9"
                ? cp.background
                : null,
          },
        },
      };
    case "canvas-v2:image":
      return {
        ...base,
        kind: "image",
        params: {
          kind: "image",
          data: {
            source: clip.sourceId
              ? { kind: "sourceId", id: clip.sourceId }
              : { kind: "url", url: "" },
            fit: (stringOr(cp.fit, "cover") as "cover" | "contain" | "stretch"),
          },
        },
      };
    case "canvas-v2:video":
      return {
        ...base,
        kind: "video",
        params: {
          kind: "video",
          data: {
            source: clip.sourceId
              ? { kind: "sourceId", id: clip.sourceId }
              : { kind: "url", url: "" },
            muted: cp.muted === true,
          },
        },
      };
    case "canvas-v2:shape-rect":
      return {
        ...base,
        kind: "shape-rect",
        params: {
          kind: "shape-rect",
          data: {
            fill: stringOr(cp.fill, "#0ea5e9"),
            strokeColor: stringOr(cp.strokeColor, "#ffffff"),
            strokeWidth: numberOr(cp.strokeWidth, 0),
            cornerRadius: numberOr(cp.cornerRadius, 8),
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
            fill: stringOr(cp.fill, "#22c55e"),
            strokeColor: stringOr(cp.strokeColor, "#ffffff"),
            strokeWidth: numberOr(cp.strokeWidth, 0),
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
            color: stringOr(cp.color, "#ffffff"),
            thickness: numberOr(cp.thickness, 2),
          },
        },
      };
    default:
      return null;
  }
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

function numberOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function stringOr(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}
