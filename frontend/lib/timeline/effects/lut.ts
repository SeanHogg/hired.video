/**
 * 3D LUT effect — applies a Cube-format colour lookup table to the
 * frame. Maps onto Lightworks' "Quick LUTs" feature.
 *
 * The .cube file is parsed at "add effect" time by the editor and the
 * resulting flat Float32Array is stored on the effect params. The
 * renderer trilinearly interpolates per pixel.
 *
 * Params:
 *   - size: number (LUT cube size, e.g. 17, 33, 65)
 *   - data: number[] flat RGB triples, length = size^3 * 3
 *   - intensity: 0..1 — blend ratio between original and LUT-mapped
 */

import { registerEffect } from "./registry";

registerEffect({
  kind: "lut",
  label: "LUT (.cube)",
  category: "color",
  defaults: { size: 0, data: [], intensity: 1 },
  apply(effect, { ctx, canvas }) {
    const size = numberOr(effect.params.size, 0);
    const data = effect.params.data;
    const intensity = clamp01(numberOr(effect.params.intensity, 1));
    if (size < 2 || !Array.isArray(data) || data.length !== size * size * size * 3) return;
    if (intensity <= 0) return;

    const lut = data as number[];
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = img.data;
    const sm1 = size - 1;

    for (let i = 0; i < px.length; i += 4) {
      const r = px[i] / 255 * sm1;
      const g = px[i + 1] / 255 * sm1;
      const b = px[i + 2] / 255 * sm1;
      const [tr, tg, tb] = trilerp(lut, size, r, g, b);
      px[i]     = lerp(px[i],     tr * 255, intensity);
      px[i + 1] = lerp(px[i + 1], tg * 255, intensity);
      px[i + 2] = lerp(px[i + 2], tb * 255, intensity);
    }
    ctx.putImageData(img, 0, 0);
  },
});

function trilerp(
  lut: number[],
  size: number,
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  const r0 = Math.floor(r), r1 = Math.min(size - 1, r0 + 1);
  const g0 = Math.floor(g), g1 = Math.min(size - 1, g0 + 1);
  const b0 = Math.floor(b), b1 = Math.min(size - 1, b0 + 1);
  const dr = r - r0, dg = g - g0, db = b - b0;

  const c000 = sample(lut, size, r0, g0, b0);
  const c100 = sample(lut, size, r1, g0, b0);
  const c010 = sample(lut, size, r0, g1, b0);
  const c110 = sample(lut, size, r1, g1, b0);
  const c001 = sample(lut, size, r0, g0, b1);
  const c101 = sample(lut, size, r1, g0, b1);
  const c011 = sample(lut, size, r0, g1, b1);
  const c111 = sample(lut, size, r1, g1, b1);

  const c00 = mix3(c000, c100, dr);
  const c10 = mix3(c010, c110, dr);
  const c01 = mix3(c001, c101, dr);
  const c11 = mix3(c011, c111, dr);
  const c0 = mix3(c00, c10, dg);
  const c1 = mix3(c01, c11, dg);
  return mix3(c0, c1, db);
}

function sample(lut: number[], size: number, r: number, g: number, b: number): [number, number, number] {
  const idx = ((b * size + g) * size + r) * 3;
  return [lut[idx], lut[idx + 1], lut[idx + 2]];
}

function mix3(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function numberOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/**
 * Parse a .cube file's text into the flat Float32Array shape stored on
 * the effect params. Single source of truth — both the editor's "load
 * LUT" file picker and any preset-bundled LUT loader call this.
 */
export function parseCubeLut(text: string): { size: number; data: number[] } {
  const lines = text.split(/\r?\n/);
  let size = 0;
  const data: number[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("TITLE")) continue;
    if (line.startsWith("LUT_3D_SIZE")) {
      const parts = line.split(/\s+/);
      size = parseInt(parts[1] ?? "0", 10);
      continue;
    }
    if (line.startsWith("DOMAIN_") || line.startsWith("LUT_1D_SIZE")) continue;
    const parts = line.split(/\s+/).map((p) => parseFloat(p));
    if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
      data.push(parts[0], parts[1], parts[2]);
    }
  }
  if (size < 2 || data.length !== size * size * size * 3) {
    throw new Error(`Invalid .cube file: size=${size}, samples=${data.length / 3}`);
  }
  return { size, data };
}
