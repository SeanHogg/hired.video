/**
 * scene-ops.ts — pure helpers for the NLE timeline (gap #124).
 *
 * Each function takes a `VideoScript` and returns a NEW one — the timeline
 * UI dispatches these into the standard `handleScriptChange` reducer in
 * StudioLayout, which integrates with version history (#131) and undo/redo.
 *
 * The compiler recomputes `start` from cumulative durations on every
 * compile, so these helpers only need to mutate `duration`, ordering, and
 * `inPoint` / `outPoint`. They never write `start` directly.
 */

import type { VideoScript, SceneScript, TransitionStyle } from "../../types/video-script";

/** Generate a fresh scene id (used by split). */
function newSceneId(prefix = "scene"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Clone a script + scenes array shallowly so reducers stay pure. */
function withScenes(script: VideoScript, scenes: SceneScript[]): VideoScript {
  return {
    ...script,
    video: { ...script.video, duration: scenes.reduce((a, s) => a + s.duration, 0) },
    scenes,
  };
}

/**
 * Reorder a scene from one index to another. No-op if either index is out
 * of range or `from === to`.
 */
export function reorderScene(script: VideoScript, from: number, to: number): VideoScript {
  if (from === to) return script;
  const scenes = [...script.scenes];
  if (from < 0 || from >= scenes.length || to < 0 || to >= scenes.length) return script;
  const [moved] = scenes.splice(from, 1);
  scenes.splice(to, 0, moved);
  return withScenes(script, scenes);
}

/**
 * Trim a scene's in / out points. `inPoint` and `outPoint` are absolute
 * positions within the scene's source content (0..sourceDuration). The
 * resulting visible `duration` is `outPoint - inPoint`. Source content
 * outside the trim is preserved so the user can drag handles back out.
 */
export function trimScene(
  script: VideoScript,
  index: number,
  inPoint: number,
  outPoint: number,
): VideoScript {
  const scenes = [...script.scenes];
  const scene = scenes[index];
  if (!scene) return script;

  const sourceDuration = scene.sourceDuration ?? scene.duration;
  const safeIn = Math.max(0, Math.min(inPoint, sourceDuration - 0.1));
  const safeOut = Math.max(safeIn + 0.1, Math.min(outPoint, sourceDuration));

  scenes[index] = {
    ...scene,
    sourceDuration,
    inPoint: safeIn,
    outPoint: safeOut,
    duration: safeOut - safeIn,
  };
  return withScenes(script, scenes);
}

/**
 * Split a scene at an absolute time on the global timeline. The half before
 * the split keeps the original id; the second half gets a fresh id and
 * inherits all visual fields. Trim points are propagated correctly so each
 * half references the right slice of `sourceDuration`.
 */
export function splitSceneAtTime(script: VideoScript, globalTime: number): VideoScript {
  // Find which scene contains globalTime + how far into it we are
  let cursor = 0;
  const scenes = [...script.scenes];
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const sceneStart = cursor;
    const sceneEnd = cursor + scene.duration;
    if (globalTime > sceneStart && globalTime < sceneEnd) {
      const localOffset = globalTime - sceneStart;
      const sourceDuration = scene.sourceDuration ?? scene.duration;
      const inPoint = scene.inPoint ?? 0;
      const splitInSource = inPoint + localOffset;

      const left: SceneScript = {
        ...scene,
        sourceDuration,
        inPoint,
        outPoint: splitInSource,
        duration: localOffset,
      };
      const right: SceneScript = {
        ...scene,
        id: newSceneId(scene.type),
        sourceDuration,
        inPoint: splitInSource,
        outPoint: scene.outPoint ?? sourceDuration,
        duration: (scene.outPoint ?? sourceDuration) - splitInSource,
        // The right half should not re-trigger the entry transition
        transitionIn: "cut",
      };

      scenes.splice(i, 1, left, right);
      return withScenes(script, scenes);
    }
    cursor = sceneEnd;
  }
  return script;
}

/**
 * Merge a scene with the next one. Visual fields (title, text, etc.) come
 * from the LEFT scene; the right scene's content becomes inaccessible and
 * its duration is added to the left. If the two scenes share the same
 * `sourceDuration` and have contiguous trim points (left.outPoint ===
 * right.inPoint), trim points are extended seamlessly.
 */
export function mergeWithNext(script: VideoScript, index: number): VideoScript {
  const scenes = [...script.scenes];
  if (index < 0 || index >= scenes.length - 1) return script;
  const left = scenes[index];
  const right = scenes[index + 1];

  // Seamless re-merge of a previous split
  const seamless =
    left.sourceDuration != null &&
    right.sourceDuration != null &&
    left.sourceDuration === right.sourceDuration &&
    left.outPoint != null &&
    right.inPoint != null &&
    Math.abs(left.outPoint - right.inPoint) < 0.001;

  const merged: SceneScript = seamless
    ? {
        ...left,
        outPoint: right.outPoint ?? left.sourceDuration,
        duration: (right.outPoint ?? left.sourceDuration!) - (left.inPoint ?? 0),
      }
    : { ...left, duration: left.duration + right.duration };

  scenes.splice(index, 2, merged);
  return withScenes(script, scenes);
}

/** Delete a scene by index. */
export function deleteScene(script: VideoScript, index: number): VideoScript {
  if (index < 0 || index >= script.scenes.length) return script;
  const scenes = script.scenes.filter((_, i) => i !== index);
  return withScenes(script, scenes);
}

/** Duplicate a scene immediately after itself. */
export function duplicateScene(script: VideoScript, index: number): VideoScript {
  const scenes = [...script.scenes];
  const scene = scenes[index];
  if (!scene) return script;
  const copy: SceneScript = { ...scene, id: newSceneId(scene.type) };
  scenes.splice(index + 1, 0, copy);
  return withScenes(script, scenes);
}

/** Set a per-boundary transition for the scene at `index`. */
export function setSceneTransition(
  script: VideoScript,
  index: number,
  transition: TransitionStyle,
): VideoScript {
  const scenes = [...script.scenes];
  const scene = scenes[index];
  if (!scene) return script;
  scenes[index] = { ...scene, transitionIn: transition };
  return withScenes(script, scenes);
}

/** Find which scene index contains `globalTime` (returns -1 if past end). */
export function sceneIndexAtTime(script: VideoScript, globalTime: number): number {
  let cursor = 0;
  for (let i = 0; i < script.scenes.length; i++) {
    cursor += script.scenes[i].duration;
    if (globalTime < cursor) return i;
  }
  return script.scenes.length - 1;
}
