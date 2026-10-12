/**
 * Scene transitions → `Timeline.sceneTransitions` (#570).
 *
 * Each scene after the first transitions in with `scene.transitionIn`, or
 * the project's `defaultTransition` when the scene doesn't override it.
 * The studio's transition presets map onto the compositor's kinds:
 *
 *   cut             → nothing (hard cut)
 *   fade            → cross-dissolve
 *   slide           → slide (push)
 *   cinematic-fade  → fade-to-black
 *
 * The window is SCENE_TRANSITION_SECONDS long, shortened so it never eats
 * more than half of either neighbouring scene. Called by
 * `canvasStateToTimeline`, so the preview overlay and every export read the
 * same transitions from the same Timeline.
 */
import type { SceneTransition, SceneTransitionKind } from "@shared/timeline";
import type { TransitionKind } from "../motion-presets";
import type { CanvasState } from "./canvas-state";

export const SCENE_TRANSITION_SECONDS = 0.5;

const KIND_FOR: Record<TransitionKind, SceneTransitionKind | null> = {
  cut: null,
  fade: "cross-dissolve",
  slide: "slide",
  "cinematic-fade": "fade-to-black",
};

/** Frame length of each scene, matching the emitter's rounding. */
export function sceneFrameLengths(state: Pick<CanvasState, "scenes" | "fps">): number[] {
  return state.scenes.map((scene) => Math.max(1, Math.round(scene.durationSeconds * state.fps)));
}

export function emitSceneTransitions(
  state: Pick<CanvasState, "scenes" | "fps" | "defaultTransition">,
): SceneTransition[] {
  const lengths = sceneFrameLengths(state);
  const out: SceneTransition[] = [];
  let atFrame = lengths[0] ?? 0;
  for (let i = 1; i < state.scenes.length; i++) {
    const preset = state.scenes[i].transitionIn ?? state.defaultTransition ?? null;
    const kind = preset ? KIND_FOR[preset] ?? null : null;
    if (kind) {
      const durationFrames = Math.min(
        Math.round(SCENE_TRANSITION_SECONDS * state.fps),
        Math.floor(lengths[i - 1] / 2),
        Math.floor(lengths[i] / 2),
      );
      if (durationFrames >= 2) out.push({ atFrame, kind, durationFrames });
    }
    atFrame += lengths[i];
  }
  return out;
}
