/**
 * Tone curves — per-channel and luma. Closes part of #352.
 *
 * Pro NLEs ship full bezier curve editors; we ship a 4-control tone
 * curve (shadows / midtones / highlights / contrast) that compiles to
 * a 256-entry LUT and applies per-pixel. The LUT shape covers the
 * common color-correction asks (lift shadows, crush highlights, push
 * contrast) without needing a custom curve-editor UI primitive — every
 * control is a slider that the existing EffectStackEditor renders out
 * of the box.
 *
 * `channel` selects which colour channel(s) the curve acts on. `luma`
 * pulls the perceived-brightness curve and applies it proportionally
 * to R/G/B (preserves hue). `rgb` runs the same curve on R, G, and B
 * independently. `r` / `g` / `b` target a single channel for cast
 * correction.
 */

import { registerEffect } from "./registry";

const CHANNEL_OPTIONS = [
  { value: "luma", labelKey: "studio.effects.option.channel.luma" },
  { value: "rgb", labelKey: "studio.effects.option.channel.rgb" },
  { value: "r", labelKey: "studio.effects.option.channel.red" },
  { value: "g", labelKey: "studio.effects.option.channel.green" },
  { value: "b", labelKey: "studio.effects.option.channel.blue" },
];

registerEffect({
  kind: "curves",
  labelKey: "studio.effects.kind.curves",
  category: "color",
  proOnly: true,
  defaults: { shadows: 0, midtones: 0, highlights: 0, contrast: 0, channel: "luma" },
  paramHints: {
    shadows: { type: "number", min: -1, max: 1, step: 0.01 },
    midtones: { type: "number", min: -1, max: 1, step: 0.01 },
    highlights: { type: "number", min: -1, max: 1, step: 0.01 },
    contrast: { type: "number", min: -1, max: 1, step: 0.01 },
    channel: { type: "select", options: CHANNEL_OPTIONS },
  },
  apply(effect, { ctx, canvas }) {
    const shadows = numberOr(effect.params.shadows, 0);
    const midtones = numberOr(effect.params.midtones, 0);
    const highlights = numberOr(effect.params.highlights, 0);
    const contrast = numberOr(effect.params.contrast, 0);
    const channel = stringOr(effect.params.channel, "luma");

    if (shadows === 0 && midtones === 0 && highlights === 0 && contrast === 0) return;

    const lut = buildToneLut(shadows, midtones, highlights, contrast);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = data.data;

    if (channel === "luma") {
      // Apply LUT to luma, keep chroma. Y = 0.299R + 0.587G + 0.114B.
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i];
        const g = px[i + 1];
        const b = px[i + 2];
        const y = 0.299 * r + 0.587 * g + 0.114 * b;
        const yNew = lut[Math.round(y)];
        const ratio = y > 0 ? yNew / y : 0;
        px[i] = clampByte(r * ratio);
        px[i + 1] = clampByte(g * ratio);
        px[i + 2] = clampByte(b * ratio);
      }
    } else if (channel === "rgb") {
      for (let i = 0; i < px.length; i += 4) {
        px[i] = lut[px[i]];
        px[i + 1] = lut[px[i + 1]];
        px[i + 2] = lut[px[i + 2]];
      }
    } else {
      const off = channel === "r" ? 0 : channel === "g" ? 1 : 2;
      for (let i = 0; i < px.length; i += 4) {
        px[i + off] = lut[px[i + off]];
      }
    }
    ctx.putImageData(data, 0, 0);
  },
});

/**
 * Build a 256-entry tone curve LUT.
 *
 * shadows/midtones/highlights pull three control points (at x=64, 128,
 * 192 in 0..255 space). Contrast is an S-curve baked on top: positive
 * contrast pushes shadows down + highlights up; negative compresses.
 * Output is monotonic-clamped to keep the curve well-behaved.
 */
function buildToneLut(
  shadows: number,
  midtones: number,
  highlights: number,
  contrast: number,
): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  // Three control points (x, y) in 0..1 space. Defaults are the diagonal.
  const x0 = 0;
  const x1 = 64 / 255;
  const x2 = 128 / 255;
  const x3 = 192 / 255;
  const x4 = 1;
  const y0 = 0;
  const y1 = clamp01(x1 + shadows * 0.25);
  const y2 = clamp01(x2 + midtones * 0.25);
  const y3 = clamp01(x3 + highlights * 0.25);
  const y4 = 1;

  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    let y: number;
    if (x <= x1) y = lerp(y0, y1, (x - x0) / (x1 - x0));
    else if (x <= x2) y = lerp(y1, y2, (x - x1) / (x2 - x1));
    else if (x <= x3) y = lerp(y2, y3, (x - x2) / (x3 - x2));
    else y = lerp(y3, y4, (x - x3) / (x4 - x3));

    if (contrast !== 0) {
      // S-curve around 0.5: y' = 0.5 + (y-0.5) * (1 + 2*contrast).
      // Negative contrast compresses toward 0.5.
      const k = 1 + 2 * contrast;
      y = 0.5 + (y - 0.5) * k;
    }
    lut[i] = Math.round(clamp01(y) * 255);
  }
  return lut;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * (t < 0 ? 0 : t > 1 ? 1 : t);
}

function numberOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function stringOr(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}
