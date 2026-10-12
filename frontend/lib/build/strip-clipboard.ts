/**
 * Strip clipboard — copy / cut / paste of a whole SCENE on the video plan
 * (pure). A scene clip is what the owner set on that scene — look, length,
 * wording overrides, voiceover, the take they recorded — plus the elements
 * they dropped into it. The video's five scenes are fixed slots, so pasting
 * REPLACES the selected scene's settings (and adds copies of the clip's
 * elements with fresh ids), and cutting switches the scene off.
 *
 * Elements (clips on the frame) are copied as canvas widgets and pasted by
 * the frame editor (`useFrameEditor.paste`), which already owns placement.
 */
import { isLastSceneOn, patchScenePlan, type ScenePlan, type VideoPlan, type VideoSceneId } from "@shared/video-plan";
import { cloneWidgetWithNewId, type CanvasState, type Widget } from "@/lib/studio/editor-v2/canvas-state";
import { addWidget } from "./canvas-overrides";
import { canvasSceneId } from "./scene-voiceover";

export interface SceneClip {
  /** The scene's settings, minus whether it is in the video. */
  scene: Omit<ScenePlan, "off">;
  /** Elements the owner added to it. */
  added: Widget[];
}

/** A stored added widget that still has a canvas widget's shape. */
function isWidget(value: unknown): value is Widget {
  const w = value as Partial<Widget> | null;
  return !!w && typeof w.id === "string" && typeof w.position === "object" && w.position !== null && typeof w.params === "object";
}

/** Copy scene `id`. Its added elements are taken as they play on `canvas`
 *  (moves, retimes and looks applied), else as stored. */
export function copySceneClip(plan: VideoPlan, id: VideoSceneId, canvas?: CanvasState | null): SceneClip {
  const { off: _off, ...scene } = plan.scenes?.[id] ?? {};
  const stored = (plan.canvas?.added?.[id] ?? []).flatMap((w) => (isWidget(w) ? [w] : []));
  const played = canvas?.scenes.find((s) => s.id === canvasSceneId(id))?.widgets ?? [];
  const added = stored.map((w) => played.find((p) => p.id === w.id) ?? w);
  // A snapshot: later edits to the source never reach what gets pasted.
  return structuredClone({ scene, added });
}

/** The plan with `clip` pasted over scene `target` (one undo step). The
 *  target is switched on; the Proof-only roles only travel to Proof. */
export function pasteSceneClip(
  plan: VideoPlan,
  target: VideoSceneId,
  clip: SceneClip,
  clone: (w: Widget) => Widget = cloneWidgetWithNewId,
): VideoPlan {
  const { roles, ...settings } = clip.scene;
  const clear = Object.fromEntries(Object.keys(plan.scenes?.[target] ?? {}).map((k) => [k, undefined]));
  const patch = { ...clear, ...settings, off: undefined, ...(target === "proof" && roles ? { roles } : {}) };
  const next = patchScenePlan(plan, target, patch);
  return clip.added.reduce((acc, w) => addWidget(acc, target, clone(w)), next);
}

/** Cut = take the scene out of the video; null when it is the last one on. */
export function cutScene(plan: VideoPlan, id: VideoSceneId): VideoPlan | null {
  if (isLastSceneOn(plan, id)) return null;
  return patchScenePlan(plan, id, { off: true });
}
