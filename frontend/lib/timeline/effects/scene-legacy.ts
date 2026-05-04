/**
 * Legacy scene-effect kinds — `particles | blur | glow` from the old
 * `SceneEffect.type` enum. Registered into the shared registry so
 * back-compat scenes still render through the same dispatch.
 *
 * `particles` is special: its visual is added as a background NODE by
 * `scene-graph.ts` BEFORE the per-frame compositor runs, so its
 * `apply()` is a no-op here — the registry entry exists so the
 * effects panel can list and add it.
 *
 * `blur` and `glow` were enum-only previously — no rendering existed.
 * We give them real apply() implementations now so adding either to a
 * scene actually does something.
 *
 * `vignette` is already registered by `stylize.ts` — don't double-register.
 */

import { registerEffect } from "./registry";

registerEffect({
  kind: "particles",
  label: "Particles",
  category: "stylize",
  defaults: { intensity: 0.6 },
  apply() {
    // No-op at the per-frame compositor level: the particles visual
    // is a background NODE injected by `compiler/scene-graph.ts` and
    // drawn through the regular node renderer. This entry exists so
    // the effects picker can offer "particles" as a kind.
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
