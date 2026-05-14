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
import { findMusicTrack } from "../music-catalog";
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
      effects: [
        {
          kind: "canvas-v2:background",
          params: { color: scene.backgroundColor, sceneId: scene.id },
        },
      ],
    });

    for (const widget of scene.widgets) {
      const clip = widgetToClip(widget, cursor, sceneFrames, fps);
      if (clip) v2.clips.push(clip);
    }

    cursor += sceneFrames;
  }

  // Music track lays a single clip across the full composition on A1. The
  // sourceId references the stock-music asset; the renderer's audio mixer
  // resolves the URL via the MediaSource map at render time. Loop / fade
  // are deferred (gap-registered) — for now the clip just covers the
  // composition length and is gain-cropped to whatever the mixer
  // produces.
  const music = state.musicTrackId ? findMusicTrack(state.musicTrackId) : null;
  if (music?.src && cursor > 0) {
    a1.clips.push({
      id: `music_${music.id}`,
      sourceId: `music:${music.id}`,
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
    const sceneId = stringOr(bgEffect?.params.sceneId, bg.id);
    const colorRaw = stringOr(bgEffect?.params.color, "#0f172a");
    const overlay = (v2?.clips ?? []).filter(
      (c) =>
        c.startFrame >= bg.startFrame &&
        c.startFrame + c.durationFrames <= bg.startFrame + bg.durationFrames,
    );
    scenes.push({
      id: sceneId,
      label:
        timeline.markers?.find((m) => m.id === sceneId)?.label ??
        `Scene ${scenes.length + 1}`,
      durationSeconds: bg.durationFrames / fps,
      backgroundColor: colorRaw,
      widgets: overlay.map((c) => clipToWidget(c, bg.startFrame, fps)).filter(isWidget),
    });
  }

  if (scenes.length === 0) {
    return emptyCanvasState({ width: timeline.width, height: timeline.height, fps });
  }
  // Recover the chosen music track from the audio track's clip sourceId
  // (we emit `music:<id>` — see canvasStateToTimeline). Single seam so
  // hydrate matches emit (DRY).
  const a1 = timeline.tracks.find((t) => t.id === "a1");
  const musicClip = a1?.clips.find((c) => c.sourceId.startsWith("music:"));
  const musicTrackId = musicClip ? musicClip.sourceId.slice("music:".length) : null;
  return {
    schemaVersion: CANVAS_STATE_VERSION,
    width: timeline.width,
    height: timeline.height,
    fps,
    scenes,
    themeId: null,
    musicTrackId,
    captions: null,
    voiceovers: [],
  };
}

function clipToWidget(clip: Clip, sceneStart: number, fps: number): Widget | null {
  const effect = clip.effects?.[0];
  if (!effect?.kind.startsWith("canvas-v2:")) return null;
  const params = effect.params;

  const base: Pick<Widget, "id" | "position" | "visibleFrom" | "visibleTo"> = {
    id: clip.id,
    position: {
      x: numberOr(params.x, 0.1),
      y: numberOr(params.y, 0.1),
      width: numberOr(params.width, 0.3),
      height: numberOr(params.height, 0.1),
      z: numberOr(params.z, 1),
    },
    visibleFrom: (clip.startFrame - sceneStart) / fps,
    visibleTo: (clip.startFrame - sceneStart + clip.durationFrames) / fps,
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
