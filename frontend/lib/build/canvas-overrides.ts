/**
 * Canvas overrides — the owner's frame-level hand edits to the résumé video,
 * stored on the plan (`plan.canvas`) and layered over the canvas derived from
 * résumé + plan.
 *
 * The derived canvas is rebuilt whenever the résumé changes, so a hand edit
 * can't live on it. Instead each edit is recorded against the widget's stable
 * id (`build-proof-heading`, `build-who-avatar`, …): a new position, a
 * visibility window, replacement wording, a look (params patch, motion,
 * container, effects), or "removed". Widgets the owner
 * drops in are stored whole under their scene (`added`). Applying is pure and
 * forgiving: an override for a widget the résumé no longer produces is
 * ignored, so the video keeps following the page while the edits stick.
 *
 * The patch helpers return a new plan and prune as they go — an empty
 * override, an empty scene list and an empty `canvas` key all disappear, so
 * an untouched video stores nothing.
 */
import type { CanvasState, Widget, WidgetParams, WidgetPosition } from "@/lib/studio/editor-v2/canvas-state";
import { isWidgetMotion } from "@/lib/studio/editor-v2/widget-motion";
import { scalePixelData, scaleStyle, scaleWidgetPixels } from "./resolution-scale";
import {
  VIDEO_SCENE_IDS,
  WidgetOverrideSchema,
  type VideoCanvasPlan,
  type VideoPlan,
  type VideoSceneId,
  type WidgetOverride,
} from "@shared/video-plan";

/** Canvas scene ids are `build-<sceneId>` (video-composition). */
const SCENE_PREFIX = "build-";

/** "build-proof" → "proof"; null for a scene the plan doesn't know. */
export function videoSceneIdOfCanvasScene(canvasSceneId: string): VideoSceneId | null {
  if (!canvasSceneId.startsWith(SCENE_PREFIX)) return null;
  const id = canvasSceneId.slice(SCENE_PREFIX.length);
  return (VIDEO_SCENE_IDS as readonly string[]).includes(id) ? (id as VideoSceneId) : null;
}

type AddedWidgets = NonNullable<VideoCanvasPlan["added"]>;
type StoredWidget = NonNullable<AddedWidgets[VideoSceneId]>[number];

/** A stored added widget is only checked for id + kind by the schema; keep
 *  the ones that still look like a canvas widget. */
function isWidget(value: StoredWidget): value is StoredWidget & Widget {
  const { position, params } = value;
  return typeof position === "object" && position !== null && typeof params === "object" && params !== null;
}

/** The widget with `text` as its wording — only kinds that carry text. */
function withText(widget: Widget, text: string): Widget {
  const { params } = widget;
  switch (params.kind) {
    case "text":
    case "heading":
      return { ...widget, params: { ...params, data: { ...params.data, text } } };
    case "speech-bubble":
      return { ...widget, params: { ...params, data: { ...params.data, text } } };
    case "caption-box":
      return { ...widget, params: { ...params, data: { ...params.data, text } } };
    case "sfx-burst":
      return { ...widget, params: { ...params, data: { ...params.data, text } } };
    default:
      return widget;
  }
}

/** `params` with `patch` merged into its data. The patch came from a
 *  PropertiesPanel edit of a widget of this same kind (planWidgetPatch), so
 *  the kind — and with it the data's shape — is kept. */
function withParamsData<P extends WidgetParams>(params: P, patch: Record<string, unknown>): P {
  return { ...params, data: { ...params.data, ...patch } };
}

function applyOverride(widget: Widget, override: WidgetOverride, scale: number): Widget {
  let next: Widget = { ...widget };
  if (override.position) next.position = { ...widget.position, ...override.position };
  if (override.visibleFrom !== undefined) next.visibleFrom = override.visibleFrom;
  if (override.visibleTo !== undefined) next.visibleTo = override.visibleTo;
  if (override.params) next.params = withParamsData(next.params, scalePixelData(override.params, scale));
  if (override.motion === null) next.motion = null;
  else if (isWidgetMotion(override.motion)) next.motion = override.motion;
  if (override.containerStyle) next.containerStyle = scaleStyle(override.containerStyle, scale);
  if (override.effects) next.effects = override.effects;
  // Wording last, so a params patch can never undo the owner's text.
  if (override.text !== undefined) next = withText(next, override.text);
  return next;
}

/** The derived canvas with the owner's hand edits on top (a new state; the
 *  input is not touched). Added widgets join their scene first, so their
 *  later moves / retimes are overrides like any other widget's. Hand edits
 *  are stored at the 1080p design scale; `scale` (resolution-scale.ts) sizes
 *  their pixel values for the export resolution, like the generated type. */
export function applyCanvasOverrides(canvas: CanvasState, overrides: VideoPlan["canvas"], scale = 1): CanvasState {
  if (!overrides) return canvas;
  const edits = overrides.widgets ?? {};
  return {
    ...canvas,
    scenes: canvas.scenes.map((scene) => {
      const sceneId = videoSceneIdOfCanvasScene(scene.id);
      const added = (sceneId ? overrides.added?.[sceneId] ?? [] : []).filter(isWidget).map((w) => scaleWidgetPixels(w, scale));
      const widgets = [...scene.widgets, ...added]
        .filter((w) => !edits[w.id]?.hidden)
        .map((w) => {
          const override = edits[w.id];
          return override ? applyOverride(w, override, scale) : w;
        });
      return { ...scene, widgets };
    }),
  };
}

/** The plan with `canvas` stored on it; an empty canvas removes the key. */
function withCanvas(plan: VideoPlan, canvas: VideoCanvasPlan): VideoPlan {
  const pruned: VideoCanvasPlan = {};
  if (canvas.widgets && Object.keys(canvas.widgets).length > 0) pruned.widgets = canvas.widgets;
  const added: AddedWidgets = {};
  for (const id of VIDEO_SCENE_IDS) {
    const list = canvas.added?.[id];
    if (list && list.length > 0) added[id] = list;
  }
  if (Object.keys(added).length > 0) pruned.added = added;
  const { canvas: _canvas, ...rest } = plan;
  return Object.keys(pruned).length > 0 ? { ...rest, canvas: pruned } : rest;
}

/** Merge a patch into one widget's override; `undefined` values clear an
 *  edit and an empty override disappears. */
function patchWidgetOverride(plan: VideoPlan, widgetId: string, patch: Partial<WidgetOverride>): VideoPlan {
  const merged: Record<string, unknown> = { ...(plan.canvas?.widgets?.[widgetId] ?? {}), ...patch };
  for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key];
  const widgets = { ...(plan.canvas?.widgets ?? {}) };
  if (Object.keys(merged).length > 0) widgets[widgetId] = merged as WidgetOverride;
  else delete widgets[widgetId];
  return withCanvas(plan, { ...plan.canvas, widgets });
}

/** Where the owner dragged / resized / rotated a widget (CanvasStage's
 *  `onWidgetMove` units: canvas fractions, z order, degrees). */
export function overrideWidgetPosition(plan: VideoPlan, widgetId: string, position: WidgetPosition): VideoPlan {
  const { x, y, width, height, z, rotation } = position;
  return patchWidgetOverride(plan, widgetId, { position: { x, y, width, height, z, rotation } });
}

/** When in its scene a widget shows (seconds from scene start; null = whole scene). */
export function overrideWidgetWindow(plan: VideoPlan, widgetId: string, from: number | null, to: number | null): VideoPlan {
  return patchWidgetOverride(plan, widgetId, { visibleFrom: from, visibleTo: to });
}

/** The owner's wording for a text-bearing widget (unlinks it from the page). */
export function overrideWidgetText(plan: VideoPlan, widgetId: string, text: string): VideoPlan {
  return patchWidgetOverride(plan, widgetId, { text });
}

/** The look edits a widget override can carry. */
export type WidgetLookPatch = Pick<WidgetOverride, "params" | "motion" | "containerStyle" | "effects">;

/** The owner's look for a résumé-made widget (a PropertiesPanel edit):
 *  `params` merges into earlier params edits; motion / container / effects
 *  replace. An edit the plan can't store (over the size budget) is not kept,
 *  so one oversized paste can never invalidate the whole saved plan. */
export function overrideWidgetLook(plan: VideoPlan, widgetId: string, patch: WidgetLookPatch): VideoPlan {
  const existing: WidgetOverride = plan.canvas?.widgets?.[widgetId] ?? {};
  const look: Partial<WidgetOverride> = { ...patch };
  if (patch.params) look.params = { ...(existing.params ?? {}), ...patch.params };
  if (!WidgetOverrideSchema.safeParse({ ...existing, ...look }).success) return plan;
  return patchWidgetOverride(plan, widgetId, look);
}

/** Remove a widget: an added one is dropped outright (with its edits); a
 *  derived one is hidden, since the résumé would bring it back. */
export function removeWidget(plan: VideoPlan, widgetId: string): VideoPlan {
  const added = plan.canvas?.added ?? {};
  const owner = VIDEO_SCENE_IDS.find((id) => added[id]?.some((w) => w.id === widgetId));
  if (!owner) {
    // Hidden is all that's left to say about it: drop its other edits.
    const { [widgetId]: _old, ...others } = plan.canvas?.widgets ?? {};
    return withCanvas(plan, { ...plan.canvas, widgets: { ...others, [widgetId]: { hidden: true } } });
  }
  const { [widgetId]: _dropped, ...widgets } = plan.canvas?.widgets ?? {};
  return withCanvas(plan, {
    widgets,
    added: { ...added, [owner]: (added[owner] ?? []).filter((w) => w.id !== widgetId) },
  });
}

/** Drop a new widget into a scene (it keeps its id; a re-add replaces it). */
export function addWidget(plan: VideoPlan, sceneId: VideoSceneId, widget: Widget): VideoPlan {
  const added = plan.canvas?.added ?? {};
  const list = (added[sceneId] ?? []).filter((w) => w.id !== widget.id);
  return withCanvas(plan, { ...plan.canvas, added: { ...added, [sceneId]: [...list, { ...widget }] } });
}

/** True when the owner has hand-edited any frame. */
export function hasCanvasOverrides(plan: VideoPlan): boolean {
  return withCanvas(plan, plan.canvas ?? {}).canvas !== undefined;
}

/** Back to the derived video: every hand edit and added widget dropped. */
export function resetCanvasOverrides(plan: VideoPlan): VideoPlan {
  const { canvas: _canvas, ...rest } = plan;
  return rest;
}
