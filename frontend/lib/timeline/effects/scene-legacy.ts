/**
 * Legacy scene-effect kinds — `particles | blur | glow` from the old
 * `SceneEffect.type` enum. Registered into the shared registry so
 * back-compat scenes still render through the same dispatch.
 *
 * `particles` runs through `drawParticleField` (the same helper that
 * powers the bg-encoded particles branch and the editor preview), so
 * adding it to any scene OR widget paints a drifting dot field over
 * the rect it's applied to. Honours `color` + `intensity` (intensity
 * scales the count between 20 and 120 dots).
 *
 * `blur` and `glow` were enum-only previously — no rendering existed.
 * We give them real apply() implementations now so adding either to a
 * scene actually does something.
 *
 * `vignette` is already registered by `stylize.ts` — don't double-register.
 */

import { registerEffect } from "./registry";
import { drawParticleField } from "./particle-field";

registerEffect({
  kind: "particles",
  label: "Particles",
  category: "stylize",
  defaults: { intensity: 0.6, color: "#7c3aed" },
  paramHints: { color: { type: "color" } },
  apply(effect, { ctx, canvas, timelineFrame }) {
    const intensity = clamp01(numberOr(effect.params.intensity, 0.6));
    if (intensity <= 0) return;
    const color = stringOr(effect.params.color, "#7c3aed");
    const count = Math.round(20 + intensity * 100);
    drawParticleField(ctx, 0, 0, canvas.width, canvas.height, color, timelineFrame, {
      count,
    });
  },
});

registerEffect({
  kind: "blur",
  label: "Blur",
  category: "stylize",
  defaults: { intensity: 0.5 },
  apply(effect, { ctx, canvas }) {
    const intensity = clamp01(numberOr(effect.params.intensity, 0.5));
    if (intensity <= 0) return;
    const w = canvas.width;
    const h = canvas.height;
    // Snapshot the current canvas, redraw via canvas.filter so blur
    // applies. We use a small offscreen because applying ctx.filter
    // doesn't blur existing pixels — only new draws.
    const snap = ctx.getImageData(0, 0, w, h);
    const off = new OffscreenCanvas(w, h);
    const offCtx = off.getContext("2d");
    if (!offCtx) return;
    offCtx.putImageData(snap, 0, 0);
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.filter = `blur(${Math.round(intensity * 24)}px)`;
    ctx.drawImage(off, 0, 0);
    ctx.restore();
  },
});

registerEffect({
  kind: "glow",
  label: "Glow",
  category: "stylize",
  defaults: { intensity: 0.5 },
  apply(effect, { ctx, canvas }) {
    const intensity = clamp01(numberOr(effect.params.intensity, 0.5));
    if (intensity <= 0) return;
    const w = canvas.width;
    const h = canvas.height;
    const snap = ctx.getImageData(0, 0, w, h);
    const off = new OffscreenCanvas(w, h);
    const offCtx = off.getContext("2d");
    if (!offCtx) return;
    offCtx.putImageData(snap, 0, 0);
    // Draw the canvas back on top of itself with a soft blur and
    // additive blend — that's the cheapest "glow" approximation that
    // produces a recognisable bloom.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.4 + intensity * 0.4;
    ctx.filter = `blur(${Math.round(8 + intensity * 24)}px)`;
    ctx.drawImage(off, 0, 0);
    ctx.restore();
  },
});

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function numberOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function stringOr(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}
