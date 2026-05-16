/**
 * Animation effects — modify a widget's transform / alpha BEFORE it
 * paints. Per the standing convention (matches `blur`/`glow`/`opacity`),
 * each kind is registered with a no-op `apply()` so the
 * EffectStackEditor picks it up automatically; the actual math lives
 * in `computeAnimateOutput()` and is called by both the canvas
 * renderer (`applyAnimateEffectsToCtx`) and the editor preview (CSS
 * translation in CanvasStage). One math definition, two render
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
  effects: ReadonlyArray<{ kind: string; params: Record<string, unknown> }>,
  input: AnimateInput,
): AnimateOutput {
  let scale = 1;
  let tx = 0;
  let ty = 0;
  let alpha = 1;
  for (const e of effects) {
    if (!ANIMATE_EFFECT_KINDS.has(e.kind)) continue;
    const out = computeOne(e.kind, e.params, input);
    scale *= out.scale;
    tx += out.tx;
    ty += out.ty;
    alpha *= out.alpha;
  }
  return { scale, tx, ty, alpha };
}

/**
 * Canvas-side adapter — compute the output and apply it to a 2D
 * context (scale + translate around the rect centre, then multiply
 * globalAlpha). Caller is responsible for `ctx.save()` / `ctx.restore()`
 * bracketing.
 */
export function applyAnimateEffectsToCtx(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  effects: ReadonlyArray<{ kind: string; params: Record<string, unknown> }>,
  rect: { x: number; y: number; w: number; h: number },
  input: AnimateInput,
): AnimateOutput {
  const out = computeAnimateOutput(effects, input);
  if (out.tx !== 0 || out.ty !== 0) {
    ctx.translate(out.tx * rect.w, out.ty * rect.h);
  }
  if (out.scale !== 1) {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    ctx.translate(cx, cy);
    ctx.scale(out.scale, out.scale);
    ctx.translate(-cx, -cy);
  }
  if (out.alpha !== 1) ctx.globalAlpha *= out.alpha;
  return out;
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
  label: "Fade in",
  category: "animate",
  defaults: { durationSec: 0.5 },
  apply: noop,
});

registerEffect({
  kind: "animate-fade-out",
  label: "Fade out",
  category: "animate",
  defaults: { durationSec: 0.5 },
  apply: noop,
});

registerEffect({
  kind: "animate-zoom-in",
  label: "Ken Burns zoom in",
  category: "animate",
  defaults: { amount: 0.2 },
  apply: noop,
});

registerEffect({
  kind: "animate-zoom-out",
  label: "Ken Burns zoom out",
  category: "animate",
  defaults: { amount: 0.2 },
  apply: noop,
});

registerEffect({
  kind: "animate-pan-left",
  label: "Pan left",
  category: "animate",
  defaults: { amount: 0.15 },
  apply: noop,
});

registerEffect({
  kind: "animate-pan-right",
  label: "Pan right",
  category: "animate",
  defaults: { amount: 0.15 },
  apply: noop,
});

registerEffect({
  kind: "animate-pulse",
  label: "Pulse",
  category: "animate",
  defaults: { amount: 0.05, hz: 1 },
  apply: noop,
});

registerEffect({
  kind: "animate-shake",
  label: "Shake",
  category: "animate",
  proOnly: true,
  defaults: { amount: 0.02 },
  apply: noop,
});
