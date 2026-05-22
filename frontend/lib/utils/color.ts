/**
 * Color utilities — single source of truth for hex parsing + RGBA
 * round-tripping. Extracted per the DRY rule (`feedback_extract_on_duplication`)
 * after the same hex-parse logic showed up in three places:
 *   • `lib/timeline/effects/overlays.ts` (timeline gradient stops)
 *   • `lib/services/drawing-engine.ts` (brush soft-falloff + flood-fill)
 *   • `lib/services/headshot-engine.ts` (backdrop gradients)
 *
 * Every caller composes on top of these primitives — there is exactly
 * one regex that parses `#rrggbb`, and one function that produces a
 * CSS `rgba(...)` string. Adding a tone-mapped variant (e.g. for HDR
 * displays) means one entry here.
 */

/** Parse `#rrggbb` (or `rrggbb`) into integer channels. Returns `null`
 *  when the string isn't a 6-digit hex color — callers decide what to
 *  do (typically fall back to a default). */
export function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return null;
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  };
}

/** Like `parseHex` but returns a 4-tuple with alpha=255 — convenient
 *  for ImageData manipulation (`px[i+0..3] = rgba`). */
export function parseHexToRgba(
  hex: string,
): [number, number, number, number] {
  const c = parseHex(hex);
  if (!c) return [255, 255, 255, 255];
  return [c.r, c.g, c.b, 255];
}

/** Format `(r, g, b)` ints back into a `#rrggbb` string. */
export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Convert `#rrggbb` + alpha to a CSS `rgba(r,g,b,a)` string. Falls
 *  back to white when the hex doesn't parse — matches the
 *  long-standing behaviour of the timeline overlays helper. */
export function hexToRgbaString(hex: string, alpha: number): string {
  const c = parseHex(hex);
  if (!c) return `rgba(255,255,255,${alpha})`;
  return `rgba(${c.r},${c.g},${c.b},${alpha})`;
}

/** Tolerance-aware channel comparison — true when every channel
 *  differs by no more than `tolerance`. Used by the flood-fill engine
 *  to decide whether a pixel belongs to the fill region. */
export function rgbaWithinTolerance(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
  tolerance: number,
): boolean {
  return (
    Math.abs(a[0] - b[0]) <= tolerance &&
    Math.abs(a[1] - b[1]) <= tolerance &&
    Math.abs(a[2] - b[2]) <= tolerance &&
    Math.abs(a[3] - b[3]) <= tolerance
  );
}
