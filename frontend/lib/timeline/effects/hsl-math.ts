/**
 * Shared RGB ↔ HSL primitives. Used by `hsl.ts` (global HSL) and
 * `secondary.ts` (qualified secondary). Single source of truth per the
 * standing DRY rule — neither effect re-implements the conversion.
 *
 * Inputs/outputs are 0..255 byte channels for RGB and 0..1 for HSL,
 * matching the canvas ImageData layout. Hue is 0..1 (multiply by 360
 * to read as degrees).
 */

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h, s, l];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hueChan(p, q, h + 1 / 3) * 255),
    Math.round(hueChan(p, q, h) * 255),
    Math.round(hueChan(p, q, h - 1 / 3) * 255),
  ];
}

function hueChan(p: number, q: number, t: number): number {
  let x = t;
  if (x < 0) x += 1;
  if (x > 1) x -= 1;
  if (x < 1 / 6) return p + (q - p) * 6 * x;
  if (x < 1 / 2) return q;
  if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
  return p;
}

/**
 * Hue-range membership weight. Returns 1 inside the qualifier band,
 * 0 outside, and a smooth ramp across the feather edge. `hue` /
 * `center` are 0..1; `width` and `feather` are 0..0.5 (fractions of
 * the full hue circle). All inputs honour wrap-around at 0/1.
 */
export function hueQualifierWeight(
  hue: number,
  center: number,
  width: number,
  feather: number,
): number {
  // Shortest signed distance on the hue circle.
  let d = Math.abs(hue - center);
  if (d > 0.5) d = 1 - d;
  if (d <= width) return 1;
  if (d >= width + feather) return 0;
  if (feather <= 0) return 0;
  return 1 - (d - width) / feather;
}
