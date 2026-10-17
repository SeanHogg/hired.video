/**
 * M5 stylize effects — film grain, chromatic aberration, vignette,
 * glitch-displacement, sharpen. Per the standing DRY rule each is a
 * single `registerEffect()` call on the shared registry; the
 * compositor and the EffectsPanel pick them up automatically.
 *
 * These ship the M5 "Total FX (NewBlue equivalent)" + "Enhanced
 * Effects" rows from the Pro feature mapping in
 * `project_nle_decision.md`. Quality target = parity by count, not
 * pixel-for-pixel reproduction of any third-party plugin.
 */

import { registerEffect } from "./registry";
import { clamp01, clampByte, numberOr } from "./params";

// ── Film grain ─────────────────────────────────────────────────────────
registerEffect({
  kind: "film-grain",
  labelKey: "studio.effects.kind.filmGrain",
  category: "stylize",
  proOnly: true,
  defaults: { intensity: 0.15 },
  apply(effect, { ctx, canvas, timelineFrame }) {
    const intensity = clamp01(numberOr(effect.params.intensity, 0.15));
    if (intensity <= 0) return;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = img.data;
    // PRNG seeded by frame so grain animates per-frame without being
    // jittery between renders. Same frame → same pattern → stable.
    let s = (timelineFrame * 9301 + 49297) >>> 0;
    const range = intensity * 64;
    for (let i = 0; i < px.length; i += 4) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const noise = ((s & 0xffff) / 0x10000 - 0.5) * range;
      px[i] = clampByte(px[i] + noise);
      px[i + 1] = clampByte(px[i + 1] + noise);
      px[i + 2] = clampByte(px[i + 2] + noise);
    }
    ctx.putImageData(img, 0, 0);
  },
});

// ── Chromatic aberration ───────────────────────────────────────────────
registerEffect({
  kind: "chromatic-aberration",
  labelKey: "studio.effects.kind.chromaticAberration",
  category: "stylize",
  proOnly: true,
  defaults: { intensity: 0.5 },
  apply(effect, { ctx, canvas }) {
    const intensity = clamp01(numberOr(effect.params.intensity, 0.5));
    if (intensity <= 0) return;
    const w = canvas.width;
    const h = canvas.height;
    const shift = Math.max(1, Math.round(intensity * 6));
    const src = ctx.getImageData(0, 0, w, h).data;
    const dst = new Uint8ClampedArray(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const rIdx = (y * w + Math.min(w - 1, x + shift)) * 4;
        const bIdx = (y * w + Math.max(0, x - shift)) * 4;
        dst[i] = src[rIdx];
        dst[i + 1] = src[i + 1];
        dst[i + 2] = src[bIdx + 2];
        dst[i + 3] = src[i + 3];
      }
    }
    ctx.putImageData(new ImageData(dst, w, h), 0, 0);
  },
});

// ── Vignette ──────────────────────────────────────────────────────────
registerEffect({
  kind: "vignette",
  labelKey: "studio.effects.kind.vignette",
  category: "stylize",
  defaults: { intensity: 0.5, radius: 0.8 },
  apply(effect, { ctx, canvas }) {
    const intensity = clamp01(numberOr(effect.params.intensity, 0.5));
    const radius = clamp01(numberOr(effect.params.radius, 0.8));
    if (intensity <= 0) return;
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.hypot(cx, cy);
    const inner = radius * maxR;
    const grad = ctx.createRadialGradient(cx, cy, inner, cx, cy, maxR);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, `rgba(0,0,0,${intensity})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  },
});

// ── Glitch displacement ────────────────────────────────────────────────
registerEffect({
  kind: "glitch",
  labelKey: "studio.effects.kind.glitch",
  category: "stylize",
  proOnly: true,
  defaults: { intensity: 0.4, blockSize: 0.05 },
  apply(effect, { ctx, canvas, timelineFrame }) {
    const intensity = clamp01(numberOr(effect.params.intensity, 0.4));
    const block = Math.max(2, Math.round(numberOr(effect.params.blockSize, 0.05) * canvas.height));
    if (intensity <= 0) return;
    const w = canvas.width;
    const h = canvas.height;
    let s = (timelineFrame * 22695477 + 1) >>> 0;
    const off = new OffscreenCanvas(w, h);
    const offCtx = off.getContext("2d");
    if (!offCtx) return;
    offCtx.drawImage(canvas as unknown as CanvasImageSource, 0, 0);
    ctx.clearRect(0, 0, w, h);
    for (let y = 0; y < h; y += block) {
      s = (s * 1103515245 + 12345) >>> 0;
      const slip = ((s & 0xffff) / 0x10000 - 0.5) * intensity * w * 0.4;
      ctx.drawImage(off, 0, y, w, block, Math.round(slip), y, w, block);
    }
  },
});

// ── Sharpen (3×3 unsharp mask) ─────────────────────────────────────────
registerEffect({
  kind: "sharpen",
  labelKey: "studio.effects.kind.sharpen",
  category: "stylize",
  proOnly: true,
  defaults: { intensity: 0.5 },
  apply(effect, { ctx, canvas }) {
    const intensity = clamp01(numberOr(effect.params.intensity, 0.5));
    if (intensity <= 0) return;
    const w = canvas.width;
    const h = canvas.height;
    const center = 1 + 4 * intensity;
    const edge = -intensity;
    const src = ctx.getImageData(0, 0, w, h).data;
    const dst = new Uint8ClampedArray(src.length);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) {
          const v =
            src[i + c] * center +
            src[i - 4 + c] * edge +
            src[i + 4 + c] * edge +
            src[i - w * 4 + c] * edge +
            src[i + w * 4 + c] * edge;
          dst[i + c] = clampByte(v);
        }
        dst[i + 3] = src[i + 3];
      }
    }
    ctx.putImageData(new ImageData(dst, w, h), 0, 0);
  },
});
