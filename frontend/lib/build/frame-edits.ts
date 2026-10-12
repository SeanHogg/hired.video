/**
 * Frame edits — the pure rules behind the kit's ONE video editor (the frame on
 * the Video view + its Advanced timeline): how a studio-style edit on the
 * canvas becomes a change to the résumé or to the video plan.
 *
 * The canvas is derived from résumé + plan, so nothing is ever written to it:
 *   - retyping a widget writes the résumé where the scene shows a résumé
 *     field (scene-text.ts), else an unlinked wording override;
 *   - moving / retiming / removing / adding writes plan overrides
 *     (canvas-overrides.ts);
 *   - look edits (colours, type, motion, container, effects) are stored
 *     whole on widgets the owner ADDED, and as a look override on résumé-made
 *     ones (`overrideWidgetLook`), so every PropertiesPanel edit is kept.
 *
 * Timing is read off the CANVAS (not the outline): narration may lengthen a
 * scene (useSceneVoiceovers), and the player must show what actually plays.
 */
import type { ResumeContent } from "@shared/resume";
import {
  SCENE_SECONDS_MAX,
  SCENE_SECONDS_MIN,
  VIDEO_SCENE_IDS,
  patchScenePlan,
  type VideoPlan,
  type VideoSceneId,
} from "@shared/video-plan";
import { defaultWidget, type CanvasState, type Widget, type WidgetParams } from "@/lib/studio/editor-v2/canvas-state";
import {
  addWidget,
  overrideWidgetLook,
  overrideWidgetPosition,
  overrideWidgetText,
  overrideWidgetWindow,
  videoSceneIdOfCanvasScene,
} from "./canvas-overrides";
import { scalePixelData, scaleStyle, scaleWidgetPixels } from "./resolution-scale";
import { sceneTextFieldOfWidget, writeShownSceneText } from "./scene-text";
import { buildVideoOutline } from "./video-outline";
import { sceneCopy, type Translate } from "./video-copy";

/** A timeline drag in seconds → a length the plan accepts (whole seconds). */
export function clampSceneSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return SCENE_SECONDS_MIN;
  return Math.min(SCENE_SECONDS_MAX, Math.max(SCENE_SECONDS_MIN, Math.round(seconds)));
}

export interface SceneTime {
  id: VideoSceneId;
  start: number;
  duration: number;
}

/** Start + length of every plan scene as the canvas plays it. */
export function canvasSceneTimes(canvas: CanvasState): SceneTime[] {
  const times: SceneTime[] = [];
  let cursor = 0;
  for (const scene of canvas.scenes) {
    const id = videoSceneIdOfCanvasScene(scene.id);
    if (id) times.push({ id, start: cursor, duration: scene.durationSeconds });
    cursor += scene.durationSeconds;
  }
  return times;
}

/** The wording of a text-bearing widget's params; null for other kinds. */
export function paramsText(params: WidgetParams): string | null {
  switch (params.kind) {
    case "text":
    case "heading":
    case "speech-bubble":
    case "caption-box":
    case "sfx-burst":
      return params.data.text;
    default:
      return null;
  }
}

/** The wording on a widget, or null when it carries no retypable text. */
export function widgetText(widget: Widget): string | null {
  return paramsText(widget.params);
}

/** The data fields of `next` that differ from `current` — wording left out
 *  (it is routed through `retypeWidget`). A field the edit dropped is not
 *  reported: JSON has no "unset", and the panel only ever sets values. */
export function changedParamsData(current: WidgetParams, next: WidgetParams): Record<string, unknown> {
  if (next.kind !== current.kind) return {};
  const before: Record<string, unknown> = { ...current.data };
  const changed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(next.data)) {
    if (key === "text" && paramsText(next) !== null) continue;
    if (value !== undefined && JSON.stringify(value) !== JSON.stringify(before[key])) changed[key] = value;
  }
  return changed;
}

/** The scene an owner-added widget was dropped into; null for résumé-made ones. */
export function addedWidgetScene(plan: VideoPlan, widgetId: string): VideoSceneId | null {
  const added = plan.canvas?.added ?? {};
  return VIDEO_SCENE_IDS.find((id) => added[id]?.some((w) => w.id === widgetId)) ?? null;
}

function isStoredWidget(value: { id: string; kind: string; [k: string]: unknown }): value is typeof value & Widget {
  const { position, params } = value;
  return typeof position === "object" && position !== null && typeof params === "object" && params !== null;
}

/** Merge a patch into an ADDED widget as stored (it is stored whole). */
export function patchAddedWidget(plan: VideoPlan, widgetId: string, patch: Partial<Widget>): VideoPlan {
  const sceneId = addedWidgetScene(plan, widgetId);
  if (!sceneId) return plan;
  const stored = plan.canvas?.added?.[sceneId]?.find((w) => w.id === widgetId);
  if (!stored || !isStoredWidget(stored)) return plan;
  const { id: _id, ...rest } = patch;
  return addWidget(plan, sceneId, { ...stored, ...rest });
}

/** A new Image / Video element showing a hosted URL (upload / stock / AI). */
export function mediaWidget(kind: "image" | "video", url: string): Widget {
  const widget = defaultWidget(kind);
  const { params } = widget;
  const source = { kind: "url" as const, url };
  if (params.kind === "image") return { ...widget, params: { ...params, data: { ...params.data, source } } };
  if (params.kind === "video") return { ...widget, params: { ...params, data: { ...params.data, source } } };
  return widget;
}

/** A new widget centred on the drop point (or where it was made), on top. */
export function placeWidget(widget: Widget, at: { x: number; y: number } | undefined, z: number): Widget {
  const { width, height } = widget.position;
  const x = at ? Math.max(0, Math.min(1 - width, at.x - width / 2)) : widget.position.x;
  const y = at ? Math.max(0, Math.min(1 - height, at.y - height / 2)) : widget.position.y;
  return { ...widget, position: { ...widget.position, x, y, z } };
}

export type RetypeResult =
  | { target: "content"; content: ResumeContent }
  | { target: "plan"; plan: VideoPlan };

/** Typing `text` on the frame: into the résumé where the widget shows a
 *  résumé field (freezing localized copy first, exactly like the scene
 *  inspector — writeShownSceneText), else as the widget's own wording. */
export function retypeWidget(
  content: ResumeContent,
  plan: VideoPlan,
  widgetId: string,
  text: string,
  t: Translate,
): RetypeResult {
  const mapped = sceneTextFieldOfWidget(widgetId);
  if (!mapped) return { target: "plan", plan: overrideWidgetText(plan, widgetId, text) };
  const outline = buildVideoOutline(content, patchScenePlan(plan, mapped.sceneId, { off: undefined }));
  const scene = outline.scenes.find((s) => s.id === mapped.sceneId);
  const shown = scene ? sceneCopy(scene, outline, t) : { heading: "", body: [] };
  return { target: "content", content: writeShownSceneText(content, mapped.sceneId, mapped.field, text, shown) };
}

export interface WidgetPatchResult {
  /** The plan with the patch applied. */
  plan: VideoPlan;
  /** New wording to route through `retypeWidget`; null = unchanged. */
  retype: string | null;
}

/** Map a studio PropertiesPanel edit (`Partial<Widget>`) onto the plan: an
 *  added widget is patched as stored; a résumé-made one gets overrides.
 *  The edit was made on the canvas at the export resolution's `scale`; its
 *  pixel sizes are stored back at the 1080p design scale (resolution-scale). */
export function planWidgetPatch(plan: VideoPlan, current: Widget, patch: Partial<Widget>, scale = 1): WidgetPatchResult {
  const { id: _id, kind: _kind, position, params: shownParams, visibleFrom, visibleTo, containerStyle: shownStyle, ...rest } = patch;
  const toDesign = 1 / scale;
  const params = shownParams
    ? ({ ...shownParams, data: scalePixelData(shownParams.data as unknown as Record<string, unknown>, toDesign) } as Widget["params"])
    : undefined;
  const look: Omit<Partial<Widget>, "id" | "kind" | "position" | "params" | "visibleFrom" | "visibleTo"> = shownStyle
    ? { ...rest, containerStyle: scaleStyle(shownStyle, toDesign) }
    : rest;
  const designCurrent = scaleWidgetPixels(current, toDesign);
  const added = addedWidgetScene(plan, current.id) !== null;
  let next = plan;
  let retype: string | null = null;

  if (position) next = overrideWidgetPosition(next, current.id, position);
  if ("visibleFrom" in patch || "visibleTo" in patch) {
    next = overrideWidgetWindow(
      next,
      current.id,
      "visibleFrom" in patch ? visibleFrom ?? null : current.visibleFrom,
      "visibleTo" in patch ? visibleTo ?? null : current.visibleTo,
    );
  }
  if (params) {
    const text = paramsText(params);
    if (text !== null && text !== widgetText(current)) retype = text;
    const changed = changedParamsData(designCurrent.params, params);
    if (Object.keys(changed).length > 0) {
      next = added ? patchAddedWidget(next, current.id, { params }) : overrideWidgetLook(next, current.id, { params: changed });
    }
  }
  if (Object.keys(look).length > 0) {
    if (added) next = patchAddedWidget(next, current.id, look);
    else {
      const { motion, containerStyle, effects } = look;
      next = overrideWidgetLook(next, current.id, {
        ...("motion" in look ? { motion } : {}),
        ...(containerStyle ? { containerStyle } : {}),
        ...(effects ? { effects } : {}),
      });
    }
  }
  return { plan: next, retype };
}
