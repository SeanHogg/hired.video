/**
 * Chroma key (green-screen) — turns pixels close to a target colour
 * into transparent so the video track underneath shows through.
 *
 * Implementation uses YCbCr distance because it tolerates lighting
 * variation on the keyed surface better than naive RGB distance. M5
 * will replace this with a Lumetri-key shader for sub-pixel matte
 * generation; this M2 implementation is the working fallback.
 *
 * Params:
 *   - keyColor: "#RRGGBB" — usually green or blue
 *   - threshold: 0..1 — distance under which a pixel is fully keyed
 *   - softness: 0..1 — distance over which the matte feathers
 *   - spillSuppression: 0..1 — how strongly to desaturate keyed colour
 *     remnants on the foreground (reduces green fringe)
 */

import { registerEffect } from "./registry";

registerEffect({
  kind: "chroma-key",
  label: "Chroma key",
  category: "key",
  defaults: { keyColor: "#00ff00", threshold: 0.4, softness: 0.1, spillSuppression: 0.5 },
  apply(effect, { ctx, canvas }) {
    const key = parseHex(stringOr(effect.params.keyColor, "#00ff00"));
    const threshold = clamp01(numberOr(effect.params.threshold, 0.4));
    const softness = Math.max(0.0001, clamp01(numberOr(effect.params.softness, 0.1)));
    const spill = clamp01(numberOr(effect.params.spillSuppression, 0.5));

    const keyYCbCr = rgbToYCbCr(key.r, key.g, key.b);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = img.data;

    for (let i = 0; i < px.length; i += 4) {
      const yc = rgbToYCbCr(px[i], px[i + 1], px[i + 2]);
      const dCb = yc[1] - keyYCbCr[1];
      const dCr = yc[2] - keyYCbCr[2];
      // Chroma-only distance, normalised to 0..1 over the ~127-range.
      const dist = Math.sqrt(dCb * dCb + dCr * dCr) / 127;

      if (dist < threshold) {
        px[i + 3] = 0;
        continue;
      }
      if (dist < threshold + softness) {
        const t = (dist - threshold) / softness;
        px[i + 3] = px[i + 3] * t;
      }

      if (spill > 0) {
        // Pull the kept pixels' chroma toward neutral whenever they
        // lean toward the key colour.
        const pull = Math.max(0, 1 - dist) * spill;
        const lum = yc[0];
        const newCb = yc[1] + (128 - yc[1]) * pull;
        const newCr = yc[2] + (128 - yc[2]) * pull;
        const rgb = yCbCrToRgb(lum, newCb, newCr);
        px[i] = rgb[0];
        px[i + 1] = rgb[1];
        px[i + 2] = rgb[2];
      }
    }

    ctx.putImageData(img, 0, 0);
  },
});

function rgbToYCbCr(r: number, g: number, b: number): [number, number, number] {
  // ITU-R BT.601 — what most consumer video uses.
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return [y, cb, cr];
}

function yCbCrToRgb(y: number, cb: number, cr: number): [number, number, number] {
  const r = y + 1.402 * (cr - 128);
  const g = y - 0.344136 * (cb - 128) - 0.714136 * (cr - 128);
  const b = y + 1.772 * (cb - 128);
  return [clamp255(r), clamp255(g), clamp255(b)];
}

function clamp255(v: number): number {
  if (v < 0) return 0;
  if (v > 255) return 255;
  return v;
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 0, g: 255, b: 0 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function numberOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function stringOr(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}
