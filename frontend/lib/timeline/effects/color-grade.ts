/**
 * Color-grade pixel effects — `sepia | mono | invert`. Each is one
 * `registerEffect()` call against the shared registry; the
 * EffectStackEditor picks them up automatically and the per-widget
 * pixel pass in canvas-v2.ts routes them against a bbox-clipped
 * offscreen so the same definitions apply to both scene-level and
 * widget-level usage. Per the standing DRY rule the registry is the
 * one dispatch — no per-effect plumbing in the panel or compositor.
 */

import { registerEffect } from "./registry";

// ── Sepia ─────────────────────────────────────────────────────────────
// Standard photographic sepia matrix mixed against the original by
// `intensity` so 0 leaves pixels untouched and 1 is the full grade.
registerEffect({
  kind: "sepia",
  label: "Sepia",
  category: "color",
  defaults: { intensity: 1 },
  apply(effect, { ctx, canvas }) {
    const intensity = clamp01(numberOr(effect.params.intensity, 1));
    if (intensity <= 0) return;
    const w = canvas.width;
    const h = canvas.height;
    const img = ctx.getImageData(0, 0, w, h);
    const px = img.data;
    const inv = 1 - intensity;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      const sr = r * 0.393 + g * 0.769 + b * 0.189;
      const sg = r * 0.349 + g * 0.686 + b * 0.168;
      const sb = r * 0.272 + g * 0.534 + b * 0.131;
      px[i] = clampByte(r * inv + sr * intensity);
      px[i + 1] = clampByte(g * inv + sg * intensity);
      px[i + 2] = clampByte(b * inv + sb * intensity);
    }
    ctx.putImageData(img, 0, 0);
  },
});

// ── Mono (black & white) ──────────────────────────────────────────────
// Rec. 709 luminance — what a TV does. `intensity` blends back toward
// the original so partial desaturation is doable without a separate hsl
// effect.
registerEffect({
  kind: "mono",
  label: "Black & white",
  category: "color",
  defaults: { intensity: 1 },
  apply(effect, { ctx, canvas }) {
    const intensity = clamp01(numberOr(effect.params.intensity, 1));
    if (intensity <= 0) return;
    const w = canvas.width;
    const h = canvas.height;
    const img = ctx.getImageData(0, 0, w, h);
    const px = img.data;
    const inv = 1 - intensity;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      const lum = r * 0.2126 + g * 0.7152 + b * 0.0722;
      px[i] = clampByte(r * inv + lum * intensity);
      px[i + 1] = clampByte(g * inv + lum * intensity);
      px[i + 2] = clampByte(b * inv + lum * intensity);
    }
    ctx.putImageData(img, 0, 0);
  },
});

// ── Invert ────────────────────────────────────────────────────────────
// Channel-wise invert. `intensity` is the mix amount so 0.5 lands at
// 50% gray on every channel — useful as a flash transition primitive.
registerEffect({
  kind: "invert",
  label: "Invert",
  category: "color",
  defaults: { intensity: 1 },
  apply(effect, { ctx, canvas }) {
    const intensity = clamp01(numberOr(effect.params.intensity, 1));
    if (intensity <= 0) return;
    const w = canvas.width;
    const h = canvas.height;
    const img = ctx.getImageData(0, 0, w, h);
    const px = img.data;
    const inv = 1 - intensity;
    for (let i = 0; i < px.length; i += 4) {
      px[i] = clampByte(px[i] * inv + (255 - px[i]) * intensity);
      px[i + 1] = clampByte(px[i + 1] * inv + (255 - px[i + 1]) * intensity);
      px[i + 2] = clampByte(px[i + 2] * inv + (255 - px[i + 2]) * intensity);
    }
    ctx.putImageData(img, 0, 0);
  },
});

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function numberOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function clampByte(v: number): number {
  if (v < 0) return 0;
  if (v > 255) return 255;
  return v;
}
