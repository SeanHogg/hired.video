/**
 * Constructors — single source of truth so the landing chooser, the
 * editor's "+ Add scene", and the timeline-to-canvas import path all
 * produce identical defaults. Part of the canvas-state model;
 * re-exported by `../canvas-state`.
 */

import { createWidgetOfKind } from "../widget-kinds/registry";
import { makeId } from "./ids";
import { CANVAS_STATE_VERSION, type CanvasState, type Scene } from "./scene-types";
import type { Widget, WidgetKind, WidgetPosition } from "./widget-types";

export function emptyCanvasState(opts: {
  width?: number;
  height?: number;
  fps?: number;
} = {}): CanvasState {
  return {
    schemaVersion: CANVAS_STATE_VERSION,
    width: opts.width ?? 1920,
    height: opts.height ?? 1080,
    fps: opts.fps ?? 30,
    scenes: [emptyScene("Scene 1")],
    themeId: null,
    audioLayers: [],
    captions: null,
    codec: null,
    motion: null,
    defaultTransition: null,
    fontFamily: null,
    colorPalette: null,
  };
}

export function emptyScene(label: string): Scene {
  return {
    id: makeId("scene"),
    label,
    durationSeconds: 5,
    backgroundColor: "#0f172a",
    widgets: [],
    filters: null,
  };
}

/** Build a scene whose entire content IS a recorded clip — a single
 *  full-bleed video widget on a black background, with the scene
 *  duration matched to the recording. This is the unit behind the
 *  "start with a slide, then a recording, then a slide" flow: the
 *  recording becomes its OWN scene so save/publish stitches
 *  slide → recording → slide into one continuous video (the renderer
 *  already concatenates scenes sequentially — no special stitch path).
 *
 *  Used by the Alt+Shift+R recorder shortcut and the AI CHRO's
 *  `studio_start_recording` tool; the legacy ActionsPanel recorder tiles
 *  keep the overlay-widget behaviour for picture-in-picture use. */
export function makeRecordingScene(
  label: string,
  url: string,
  durationSeconds: number,
): Scene {
  const video = defaultWidget("video");
  if (video.params.kind === "video") {
    video.params.data.source = { kind: "url", url };
    video.params.data.muted = false;
  }
  // Full-bleed: the recording fills the frame.
  video.position = { x: 0, y: 0, width: 1, height: 1, z: 1, rotation: 0 };
  return {
    id: makeId("scene"),
    label,
    durationSeconds: durationSeconds > 0 ? durationSeconds : 5,
    backgroundColor: "#000000",
    widgets: [video],
    filters: null,
  };
}

/** Default widget bodies. Keeps the palette dispatch in WidgetPalette.tsx
 *  free of per-kind branching — the palette just calls `defaultWidget(kind)`. */
export function defaultWidget(kind: WidgetKind): Widget {
  const id = makeId("w");
  const position: WidgetPosition = {
    x: 0.1,
    y: 0.1,
    width: 0.4,
    height: 0.15,
    z: 1,
    rotation: 0,
  };
  return createWidgetOfKind(kind, id, position);
}

/** Deep-clone a widget with a freshly-minted id. Used by the editor's
 *  copy/paste flow so the same source widget can be pasted multiple
 *  times without colliding ids. structuredClone keeps nested params
 *  (text/image/shape/etc) decoupled from the source. */
export function cloneWidgetWithNewId(widget: Widget): Widget {
  return { ...structuredClone(widget), id: makeId("w") };
}

/** Deep-clone a scene + all of its widgets with freshly-minted ids.
 *  Used by paste-scene so the duplicated scene's widget ids don't
 *  collide with the original's. */
export function cloneSceneWithNewIds(scene: Scene): Scene {
  const cloned = structuredClone(scene);
  return {
    ...cloned,
    id: makeId("scene"),
    widgets: cloned.widgets.map((w) => ({ ...w, id: makeId("w") })),
  };
}
