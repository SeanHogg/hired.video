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

// ─── Advanced trim modes (Slice E — Lightworks-style) ──────────────────
//
// These are the four classic NLE trim modes. `trimScene` (above)
// covers the simplest case (move one edge, ripple later scenes via
// the natural cumulative-duration recompute in `withScenes`). The
// four below add the multi-scene operations.

/**
 * Ripple trim — move ONE edge of scene `index`. Equivalent to
 * `trimScene` because the cumulative-time model already ripples
 * downstream scenes when one scene's duration changes; exposed here
 * under the canonical NLE name so the editor binding is explicit.
 *
 * `edge: 'in'`  → drag the left handle (changes inPoint + duration)
 * `edge: 'out'` → drag the right handle (changes outPoint + duration)
 *
 * `delta` is in seconds, positive = later; negative = earlier.
 */
export function rippleTrim(
  script: VideoScript,
  index: number,
  edge: "in" | "out",
  delta: number,
): VideoScript {
  const scene = script.scenes[index];
  if (!scene) return script;
  const sourceDuration = scene.sourceDuration ?? scene.duration;
  const inPoint = scene.inPoint ?? 0;
  const outPoint = scene.outPoint ?? sourceDuration;
  if (edge === "in") {
    return trimScene(script, index, inPoint + delta, outPoint);
  }
  return trimScene(script, index, inPoint, outPoint + delta);
}

/**
 * Roll edit — move the boundary BETWEEN scene `index` and scene
 * `index+1`. The first scene's outpoint and the second scene's inpoint
 * shift by the same delta, so the total duration of the pair is
 * preserved. Used to nudge a cut without changing the rest of the
 * timeline.
 */
export function rollEdit(
  script: VideoScript,
  index: number,
  delta: number,
): VideoScript {
  const a = script.scenes[index];
  const b = script.scenes[index + 1];
  if (!a || !b) return script;

  const aSrc = a.sourceDuration ?? a.duration;
  const bSrc = b.sourceDuration ?? b.duration;
  const aIn  = a.inPoint  ?? 0;
  const aOut = a.outPoint ?? aSrc;
  const bIn  = b.inPoint  ?? 0;
  const bOut = b.outPoint ?? bSrc;

  // Clamp delta against both scenes' available source room so neither
  // collapses to <0.1s and neither tries to read past its source.
  const minDelta = Math.max(aIn - aOut + 0.1, bIn - bOut + 0.1);
  const maxDelta = Math.min(aSrc - aOut, bIn);
  const safe = Math.max(minDelta, Math.min(maxDelta, delta));

  let next = trimScene(script, index, aIn, aOut + safe);
  next = trimScene(next, index + 1, bIn + safe, bOut);
  return next;
}

/**
 * Slip edit — slide the source-window of scene `index` by `delta`
 * seconds without changing the scene's timeline position or duration.
 * The scene plays a different slice of its source media; everything
 * around it stays put.
 */
export function slipEdit(
  script: VideoScript,
  index: number,
  delta: number,
): VideoScript {
  const scene = script.scenes[index];
  if (!scene) return script;
  const sourceDuration = scene.sourceDuration ?? scene.duration;
  const currentIn = scene.inPoint ?? 0;
  const currentOut = scene.outPoint ?? sourceDuration;
  // Clamp so both edges stay within the source media.
  const minDelta = -currentIn;
  const maxDelta = sourceDuration - currentOut;
  const safe = Math.max(minDelta, Math.min(maxDelta, delta));
  if (safe === 0) return script;

  const scenes = [...script.scenes];
  scenes[index] = {
    ...scene,
    sourceDuration,
    inPoint: currentIn + safe,
    outPoint: currentOut + safe,
    // Duration unchanged — that's the point of slip.
  };
  return withScenes(script, scenes);
}

/**
 * Slide edit — move scene `index` along the timeline by `delta`
 * seconds while keeping its source slice intact. The previous scene
 * absorbs (or releases) the displacement on one side, and the next
 * scene absorbs the opposite delta on the other. Total timeline
 * duration is preserved.
 */
export function slideEdit(
  script: VideoScript,
  index: number,
  delta: number,
): VideoScript {
  const prev = script.scenes[index - 1];
  const cur  = script.scenes[index];
  const next = script.scenes[index + 1];
  if (!cur) return script;

  // First / last clip: nowhere to slide into. No-op.
  if (!prev || !next) return script;

  const prevSrc = prev.sourceDuration ?? prev.duration;
  const nextSrc = next.sourceDuration ?? next.duration;
  const prevIn  = prev.inPoint  ?? 0;
  const prevOut = prev.outPoint ?? prevSrc;
  const nextIn  = next.inPoint  ?? 0;
  const nextOut = next.outPoint ?? nextSrc;

  // Positive delta = move current scene later. prev grows by +delta;
  // next shrinks by +delta.
  const minDelta = Math.max(prevIn - prevOut + 0.1, nextIn - nextOut + 0.1) * -1;
  const maxDelta = Math.min(prevSrc - prevOut, nextOut - nextIn - 0.1);
  const safe = Math.max(minDelta, Math.min(maxDelta, delta));
  if (safe === 0) return script;

  let result = trimScene(script, index - 1, prevIn, prevOut + safe);
  result = trimScene(result, index + 1, nextIn + safe, nextOut);
  return result;
}
