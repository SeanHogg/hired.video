/**
 * Animation effects — modify a widget's transform / alpha BEFORE it
 * paints, driven by the clip's local time. Per the standing convention
 * (matches `blur`/`glow`/`opacity`), each kind is registered with a
 * no-op `apply()` so the EffectStackEditor picks it up automatically;
 * the actual math lives in `applyAnimateEffect()` below and is called
 * from `applyWidgetCanvasState` in canvas-v2.ts during the transform
 * phase.
 *
 * Determinism: every effect derives its value purely from `clipFrame /
 * clipDurationFrames` (or `clipFrame / fps` for absolute-time fades), so
 * frame N is independent of frame N-1 — safe for off-main-thread encode.
 *
 * Legacy `widget.params.animation` (image/video ken-burns prop) is
 * routed through this same helper via a synthesis seam in canvas-v2.ts.
 * That's the DRY collapse: editor preview, render-side, and legacy
 * prop all derive from one math definition.
 */

import { registerEffect } from "./registry";

interface AnimateRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface AnimateContext {
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  rect: AnimateRect;
  clipFrame: number;
  clipDurationFrames: number;
  fps: number;
}

/**
 * Apply an `animate-*` effect's transform / alpha mutation to the
 * current ctx. Caller is responsible for `ctx.save()` / `ctx.restore()`
 * bracketing (matches the canvas-v2 widget convention).
 *
 * Returns silently for unknown kinds so future-version saves still
 * render the rest of the chain.
 */
export function applyAnimateEffect(
  kind: string,
  params: Record<string, unknown>,
  context: AnimateContext,
): void {
  switch (kind) {
    case "animate-fade-in":
      return fadeIn(params, context);
    case "animate-fade-out":
      return fadeOut(params, context);
    case "animate-zoom-in":
      return zoom(params, context, +1);
    case "animate-zoom-out":
      return zoom(params, context, -1);
    case "animate-pan-left":
      return pan(params, context, -1);
    case "animate-pan-right":
      return pan(params, context, +1);
    case "animate-pulse":
      return pulse(params, context);
    case "animate-shake":
      return shake(params, context);
    default:
      return;
  }
}

/** Set of kinds handled by `applyAnimateEffect` — exported so
 *  `applyWidgetPixelEffects` can skip them in the pixel pass (they've
 *  already been folded into ctx state during the transform phase). */
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

// ── Math helpers ──────────────────────────────────────────────────────

function fadeIn(params: Record<string, unknown>, c: AnimateContext): void {
  const durationFrames = Math.max(1, numberOr(params.durationSec, 0.5) * c.fps);
  const t = clamp01(c.clipFrame / durationFrames);
  c.ctx.globalAlpha *= t;
}

function fadeOut(params: Record<string, unknown>, c: AnimateContext): void {
  const durationFrames = Math.max(1, numberOr(params.durationSec, 0.5) * c.fps);
  const remaining = c.clipDurationFrames - c.clipFrame;
  const t = clamp01(remaining / durationFrames);
  c.ctx.globalAlpha *= t;
}

function zoom(
  params: Record<string, unknown>,
  c: AnimateContext,
  direction: 1 | -1,
): void {
  const amount = Math.max(0, numberOr(params.amount, 0.2));
  const progress = clipProgress(c);
  // direction=+1 → scale 1 → 1+amount; direction=-1 → scale 1+amount → 1.
  const scale = direction > 0 ? 1 + amount * progress : 1 + amount * (1 - progress);
  scaleAroundCentre(c.ctx, c.rect, scale);
}

function pan(
  params: Record<string, unknown>,
  c: AnimateContext,
  direction: 1 | -1,
): void {
  const amount = Math.max(0, numberOr(params.amount, 0.15));
  const progress = clipProgress(c);
  // Pan distance = amount * widget width, centred on 0 — at progress 0
  // the widget sits at -amount*w/2, at progress 1 at +amount*w/2 (or the
  // mirror for direction=-1).
  const dx = direction * amount * c.rect.w * (progress - 0.5);
  c.ctx.translate(dx, 0);
  // Slight zoom (1.1×) so the panned edges never reveal the canvas
  // beneath — matches the v1 Ken-Burns pan rendering.
  scaleAroundCentre(c.ctx, c.rect, 1.1);
}

function pulse(params: Record<string, unknown>, c: AnimateContext): void {
  const amount = Math.max(0, numberOr(params.amount, 0.05));
  const hz = Math.max(0.1, numberOr(params.hz, 1));
  // Per-second oscillation: scale ∈ [1-amount, 1+amount].
  const t = c.clipFrame / c.fps;
  const scale = 1 + Math.sin(t * hz * Math.PI * 2) * amount;
  scaleAroundCentre(c.ctx, c.rect, scale);
}

function shake(params: Record<string, unknown>, c: AnimateContext): void {
  const amount = Math.max(0, numberOr(params.amount, 0.02));
  // Deterministic noise from the frame counter — two LCG taps for x/y
  // so successive frames jitter independently in each axis.
  let s = (c.clipFrame * 9301 + 49297) >>> 0;
  s = (s * 1664525 + 1013904223) >>> 0;
  const nx = ((s & 0xffff) / 0x10000 - 0.5) * 2;
  s = (s * 1664525 + 1013904223) >>> 0;
  const ny = ((s & 0xffff) / 0x10000 - 0.5) * 2;
  c.ctx.translate(nx * amount * c.rect.w, ny * amount * c.rect.h);
}

function scaleAroundCentre(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  rect: AnimateRect,
  scale: number,
): void {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);
}

function clipProgress(c: AnimateContext): number {
  if (c.clipDurationFrames <= 0) return 0;
  return clamp01(c.clipFrame / c.clipDurationFrames);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function numberOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

// ── Registry entries ──────────────────────────────────────────────────
// Each is a no-op apply per the existing convention (CSS-equivalent
// pattern). The transform math runs in canvas-v2.ts's transform phase
// via applyAnimateEffect.

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
