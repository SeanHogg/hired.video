/**
 * Animation effects — modify a widget's transform / alpha BEFORE it
 * paints. Per the standing convention (matches `blur`/`glow`/`opacity`),
 * each kind is registered with a no-op `apply()` so the
 * EffectStackEditor picks it up automatically; the actual math lives
 * in `computeAnimateOutput()`, resolved once per widget frame
 * (lib/studio/widgets/frame.ts) and applied by both the canvas renderer
 * and the editor preview. One math definition, two render
 * targets — the DRY collapse closes gap #659.
 *
 * Output is unit-free: `scale` is a multiplier, `tx`/`ty` are fractions
 * of the widget's own dimensions, `alpha` is a multiplier. Callers
 * scale the translations into pixels (canvas) or percent (CSS).
 *
 * Determinism: every effect derives its value purely from
 * `clipTimeSec / clipDurationSec`, so frame N is independent of frame
 * N-1 — safe for off-main-thread encode and stable across editor
 * preview refreshes.
 */

import { registerEffect } from "./registry";
import { ease } from "./easing";
import type { MotionPhase, WidgetMotion } from "@/lib/studio/editor-v2/widget-motion";

export interface AnimateInput {
  /** Seconds since the widget became visible (0 at clip start). */
  clipTimeSec: number;
  /** Total widget visibility duration in seconds. */
  clipDurationSec: number;
}

export interface AnimateOutput {
  /** Multiplicative scale around the widget's centre. */
  scale: number;
  /** Translation as a fraction of the widget's own width. */
  tx: number;
  /** Translation as a fraction of the widget's own height. */
  ty: number;
  /** Alpha multiplier (1 = unchanged). */
  alpha: number;
}

export const IDENTITY_ANIMATE_OUTPUT: AnimateOutput = {
  scale: 1,
  tx: 0,
  ty: 0,
  alpha: 1,
};

/** Set of kinds handled here — exported so the canvas-v2 pixel pass
 *  can skip them (they've already been folded into transform/alpha). */
export const ANIMATE_EFFECT_KINDS: ReadonlySet<string> = new Set([
  "animate-fade-in",
  "animate-fade-out",
  "animate-zoom-in",
  "animate-zoom-out",
  "animate-pan-left",
  "animate-pan-right",
  "animate-pulse",
  "animate-shake",
]);

/**
 * Compose every animate effect in the chain into a single transform +
 * alpha output. Effects multiply: two `animate-zoom-in`s with amount
 * 0.1 produce a 1.21× scale at progress 1, two fade-ins multiply
 * alpha.
 *
 * Pure function — no side effects on either consumer; the canvas
 * renderer and the DOM preview both call this and translate the
 * result into their own coordinate system.
 */
export function computeAnimateOutput(
  effects: ReadonlyArray<{ kind: string; params: Record<string, unknown> }> | undefined,
  input: AnimateInput,
  /** The widget's enter / exit motion (`Widget.motion`) — composed on
   *  top of the animate-* chain so both renderers honour it. */
  motion?: WidgetMotion | null,
): AnimateOutput {
  let scale = 1;
  let tx = 0;
  let ty = 0;
  let alpha = 1;
  const parts: AnimateOutput[] = [];
  for (const e of effects ?? []) {
    if (ANIMATE_EFFECT_KINDS.has(e.kind)) parts.push(computeOne(e.kind, e.params, input));
  }
  if (motion) {
    parts.push(motionPhaseOutput(motion.enter, enterProgress(motion.enter, input)));
    parts.push(motionPhaseOutput(motion.exit, exitProgress(motion.exit, input)));
  }
  for (const out of parts) {
    scale *= out.scale;
    tx += out.tx;
    ty += out.ty;
    alpha *= out.alpha;
  }
  return { scale, tx, ty, alpha };
}

// ── Widget enter / exit motion (Widget.motion) ───────────────────────

/** How far (fraction of the widget's own size) a slide travels. */
const SLIDE_DISTANCE = 0.6;
/** Starting scale of the "scale" entrance. */
const SCALE_FROM = 0.6;
/** Peak overshoot of the "pulse" entrance. */
const PULSE_AMOUNT = 0.12;

/** Enter progress 0 → 1 over the first `durationSeconds` of the window. */
function enterProgress(phase: MotionPhase, i: AnimateInput): number {
  if (phase.kind === "none" || phase.durationSeconds <= 0) return 1;
  return ease(phase.easing, clamp01(i.clipTimeSec / phase.durationSeconds));
}

/** Exit progress 1 → 0 over the last `durationSeconds` of the window. */
function exitProgress(phase: MotionPhase, i: AnimateInput): number {
  if (phase.kind === "none" || phase.durationSeconds <= 0) return 1;
  return ease(phase.easing, clamp01((i.clipDurationSec - i.clipTimeSec) / phase.durationSeconds));
}

/** One phase's pose at progress `p` (0 = hidden pose, 1 = resting pose). */
function motionPhaseOutput(phase: MotionPhase, p: number): AnimateOutput {
  if (p >= 1) return IDENTITY_ANIMATE_OUTPUT;
  const away = 1 - p;
  switch (phase.kind) {
    case "fade":
      return { ...IDENTITY_ANIMATE_OUTPUT, alpha: p };
    case "slide-left":
      return { ...IDENTITY_ANIMATE_OUTPUT, tx: -SLIDE_DISTANCE * away, alpha: p };
    case "slide-right":
      return { ...IDENTITY_ANIMATE_OUTPUT, tx: SLIDE_DISTANCE * away, alpha: p };
    case "slide-up":
      return { ...IDENTITY_ANIMATE_OUTPUT, ty: SLIDE_DISTANCE * away, alpha: p };
    case "slide-down":
      return { ...IDENTITY_ANIMATE_OUTPUT, ty: -SLIDE_DISTANCE * away, alpha: p };
    case "scale":
      return { ...IDENTITY_ANIMATE_OUTPUT, scale: SCALE_FROM + (1 - SCALE_FROM) * p, alpha: p };
    case "pulse":
      return { ...IDENTITY_ANIMATE_OUTPUT, scale: 1 + Math.sin(p * Math.PI) * PULSE_AMOUNT, alpha: Math.min(1, p * 2) };
    case "none":
    default:
      return IDENTITY_ANIMATE_OUTPUT;
  }
}

// ── Per-kind math ────────────────────────────────────────────────────

function computeOne(
  kind: string,
  params: Record<string, unknown>,
  input: AnimateInput,
): AnimateOutput {
  switch (kind) {
    case "animate-fade-in":
      return fadeIn(params, input);
    case "animate-fade-out":
      return fadeOut(params, input);
    case "animate-zoom-in":
      return zoom(params, input, +1);
    case "animate-zoom-out":
      return zoom(params, input, -1);
    case "animate-pan-left":
      return pan(params, input, -1);
    case "animate-pan-right":
      return pan(params, input, +1);
    case "animate-pulse":
      return pulse(params, input);
    case "animate-shake":
      return shake(params, input);
    default:
      return IDENTITY_ANIMATE_OUTPUT;
  }
}

function fadeIn(params: Record<string, unknown>, i: AnimateInput): AnimateOutput {
  const duration = Math.max(0.001, numberOr(params.durationSec, 0.5));
  const t = clamp01(i.clipTimeSec / duration);
  return { ...IDENTITY_ANIMATE_OUTPUT, alpha: t };
}

function fadeOut(params: Record<string, unknown>, i: AnimateInput): AnimateOutput {
  const duration = Math.max(0.001, numberOr(params.durationSec, 0.5));
  const remaining = i.clipDurationSec - i.clipTimeSec;
  const t = clamp01(remaining / duration);
  return { ...IDENTITY_ANIMATE_OUTPUT, alpha: t };
}

function zoom(
  params: Record<string, unknown>,
  i: AnimateInput,
  direction: 1 | -1,
): AnimateOutput {
  const amount = Math.max(0, numberOr(params.amount, 0.2));
  const progress = clipProgress(i);
  const scale = direction > 0 ? 1 + amount * progress : 1 + amount * (1 - progress);
  return { ...IDENTITY_ANIMATE_OUTPUT, scale };
}

function pan(
  params: Record<string, unknown>,
  i: AnimateInput,
  direction: 1 | -1,
): AnimateOutput {
  const amount = Math.max(0, numberOr(params.amount, 0.15));
  const progress = clipProgress(i);
  // tx is a fraction of widget width; the 1.1× scale hides the edge
  // that would otherwise expose the empty canvas beneath.
  const tx = direction * amount * (progress - 0.5);
  return { ...IDENTITY_ANIMATE_OUTPUT, scale: 1.1, tx };
}

function pulse(params: Record<string, unknown>, i: AnimateInput): AnimateOutput {
  const amount = Math.max(0, numberOr(params.amount, 0.05));
  const hz = Math.max(0.1, numberOr(params.hz, 1));
  const scale = 1 + Math.sin(i.clipTimeSec * hz * Math.PI * 2) * amount;
  return { ...IDENTITY_ANIMATE_OUTPUT, scale };
}

function shake(params: Record<string, unknown>, i: AnimateInput): AnimateOutput {
  const amount = Math.max(0, numberOr(params.amount, 0.02));
  // Deterministic two-tap LCG seeded on the integer frame index (30fps
  // bucket) so the jitter pattern is identical across editor / render.
  const seed = Math.floor(i.clipTimeSec * 30);
  let s = (seed * 9301 + 49297) >>> 0;
  s = (s * 1664525 + 1013904223) >>> 0;
  const nx = ((s & 0xffff) / 0x10000 - 0.5) * 2;
  s = (s * 1664525 + 1013904223) >>> 0;
  const ny = ((s & 0xffff) / 0x10000 - 0.5) * 2;
  return { ...IDENTITY_ANIMATE_OUTPUT, tx: nx * amount, ty: ny * amount };
}

function clipProgress(i: AnimateInput): number {
  if (i.clipDurationSec <= 0) return 0;
  return clamp01(i.clipTimeSec / i.clipDurationSec);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function numberOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

// ── Registry entries ──────────────────────────────────────────────────
// Each is a no-op apply per the existing CSS-equivalent convention.
// Math lives in computeAnimateOutput; canvas renderer and DOM preview
// both call it.

const noop = () => {};

registerEffect({
  kind: "animate-fade-in",
  labelKey: "studio.effects.kind.fadeIn",
  category: "animate",
  defaults: { durationSec: 0.5 },
  apply: noop,
});

registerEffect({
  kind: "animate-fade-out",
  labelKey: "studio.effects.kind.fadeOut",
  category: "animate",
  defaults: { durationSec: 0.5 },
  apply: noop,
});

registerEffect({
  kind: "animate-zoom-in",
  labelKey: "studio.effects.kind.kenBurnsZoomIn",
  category: "animate",
  defaults: { amount: 0.2 },
  apply: noop,
});

registerEffect({
  kind: "animate-zoom-out",
  labelKey: "studio.effects.kind.kenBurnsZoomOut",
  category: "animate",
  defaults: { amount: 0.2 },
  apply: noop,
});

registerEffect({
  kind: "animate-pan-left",
  labelKey: "studio.effects.kind.panLeft",
  category: "animate",
  defaults: { amount: 0.15 },
  apply: noop,
});

registerEffect({
  kind: "animate-pan-right",
  labelKey: "studio.effects.kind.panRight",
  category: "animate",
  defaults: { amount: 0.15 },
  apply: noop,
});

registerEffect({
  kind: "animate-pulse",
  labelKey: "studio.effects.kind.pulse",
  category: "animate",
  defaults: { amount: 0.05, hz: 1 },
  apply: noop,
});

registerEffect({
  kind: "animate-shake",
  labelKey: "studio.effects.kind.shake",
  category: "animate",
  proOnly: true,
  defaults: { amount: 0.02 },
  apply: noop,
});
