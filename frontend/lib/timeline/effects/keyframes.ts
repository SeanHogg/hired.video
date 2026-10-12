/**
 * Keyframe tracks for effect params (#282, NLE M2).
 *
 * Any numeric effect param may hold a `KeyframeTrack` instead of a static
 * number. Keyframe positions are FRACTIONS of the clip's lifetime (0 = the
 * clip's first frame, 1 = its last), not absolute frames, so trimming or
 * retiming a clip keeps the animation's shape — the same convention the
 * animate-* effects use.
 *
 * Resolution happens at the two dispatch seams, never inside an applier:
 *   - `applyEffects` (registry.ts) for timeline / scene clips;
 *   - `resolveFrame` (lib/studio/widgets/frame.ts) for canvas widgets, which
 *     feeds BOTH the DOM preview and the export painter.
 * Appliers therefore keep reading plain numbers, and an effect written
 * before keyframes existed renders exactly as before.
 *
 * Pure and React-free.
 */
import type { MotionEasing } from "@/lib/studio/editor-v2/widget-motion";
import { ease } from "./easing";

export interface Keyframe {
  /** Position in the clip, 0..1. */
  t: number;
  value: number;
  /** Curve used on the way FROM this keyframe to the next. Default linear. */
  easing?: MotionEasing | "hold";
}

export interface KeyframeTrack {
  keyframes: Keyframe[];
}

const EASINGS: ReadonlySet<string> = new Set(["linear", "ease-in", "ease-out", "ease-in-out", "hold"]);

function isKeyframe(v: unknown): v is Keyframe {
  if (typeof v !== "object" || v === null) return false;
  const k = v as { t?: unknown; value?: unknown; easing?: unknown };
  return (
    typeof k.t === "number" &&
    Number.isFinite(k.t) &&
    typeof k.value === "number" &&
    Number.isFinite(k.value) &&
    (k.easing === undefined || (typeof k.easing === "string" && EASINGS.has(k.easing)))
  );
}

/** Runtime guard — a persisted param is a track when it carries at least
 *  one well-formed keyframe. */
export function isKeyframeTrack(v: unknown): v is KeyframeTrack {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const frames = (v as { keyframes?: unknown }).keyframes;
  return Array.isArray(frames) && frames.length > 0 && frames.every(isKeyframe);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Value of a track at clip progress `progress` (clamped to 0..1). Before
 *  the first keyframe the first value holds; after the last, the last. */
export function evaluateKeyframes(track: KeyframeTrack, progress: number): number {
  const p = clamp01(Number.isFinite(progress) ? progress : 0);
  const frames = track.keyframes.slice().sort((a, b) => a.t - b.t);
  const first = frames[0];
  if (p <= first.t) return first.value;
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i];
    const b = frames[i + 1];
    if (p > b.t) continue;
    const span = b.t - a.t;
    if (span <= 0) return b.value;
    const easing = a.easing ?? "linear";
    if (easing === "hold") return a.value;
    const local = ease(easing, (p - a.t) / span);
    return a.value + (b.value - a.value) * local;
  }
  return frames[frames.length - 1].value;
}

/** Params with every keyframe track replaced by its value at `progress`.
 *  Returns the SAME object when nothing is keyframed (cheap common case). */
export function resolveKeyframedParams(
  params: Record<string, unknown>,
  progress: number,
): Record<string, unknown> {
  let out: Record<string, unknown> | null = null;
  for (const key of Object.keys(params)) {
    const v = params[key];
    if (!isKeyframeTrack(v)) continue;
    if (!out) out = { ...params };
    out[key] = evaluateKeyframes(v, progress);
  }
  return out ?? params;
}

/** An effect entry with its params resolved at `progress`. */
export function resolveEffectAt<E extends { kind: string; params: Record<string, unknown> }>(
  effect: E,
  progress: number,
): E {
  const params = resolveKeyframedParams(effect.params, progress);
  return params === effect.params ? effect : { ...effect, params };
}

/** A two-keyframe ramp across the whole clip — what the editor's
 *  "Animate" toggle creates from a static value. */
export function rampTrack(from: number, to: number, easing: MotionEasing = "linear"): KeyframeTrack {
  return { keyframes: [{ t: 0, value: from, easing }, { t: 1, value: to }] };
}

/** The static value a track collapses back to when animation is switched
 *  off — its first keyframe, so the clip's opening frame is unchanged. */
export function trackStartValue(track: KeyframeTrack): number {
  return evaluateKeyframes(track, 0);
}
