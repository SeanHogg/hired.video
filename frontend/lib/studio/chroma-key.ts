/**
 * Chroma-key (green-screen) math — single source of truth for the
 * pixel pass that knocks the key colour out of a frame, shared by:
 *
 *   - the registered `chroma-key` effect in
 *     `frontend/lib/timeline/effects/chroma-key.ts` (render side: runs
 *     against the offscreen widget bbox the canvas-v2 pixel pass hands
 *     it via the effect registry)
 *   - the editor preview `ChromaVideoBody` (DOM <video> blitted to a
 *     <canvas> on every RAF; the canvas pixels go through this same
 *     function so what the user sees in preview matches export)
 *
 * Algorithm: BT.601 YCbCr chromatic distance — keys cleanly across
 * lighting variation on the keyed surface (better than naive RGB
 * distance, matches consumer-camera colour space). The key is the
 * chrominance-only distance (luma ignored), normalised to 0..1 over
 * the ~127-byte chroma range. Softness ramps alpha linearly back to
 * opaque past the threshold; spillSuppression pulls retained pixels'
 * chroma toward neutral whenever they lean toward the key colour
 * (reduces the green halo around foreground subjects).
 *
 * Per DRY: there is exactly ONE chroma-key implementation in the
 * editor. Surfaces that need to apply it call `applyChromaKeyToPixels`;
 * surfaces that need the type call `ChromaKeyParams` from canvas-state.
 */
import type { ChromaKeyParams } from "./editor-v2/canvas-state";
import { clamp01Finite } from "@/lib/numeric";

/** Default chroma-key params for a fresh enable click. Bright-green
 *  pinewood-style screen, moderate threshold, a touch of edge feather,
 *  half-strength spill suppression. Aligned with the `chroma-key`
 *  effect's `defaults` so they can't drift. */
export const DEFAULT_CHROMA_KEY: ChromaKeyParams = {
  keyColor: "#00ff00",
  threshold: 0.4,
  softness: 0.1,
  spillSuppression: 0.5,
};

/** Mutates `pixels` in-place. RGBA layout, 4 bytes per pixel. Returns
 *  the same buffer for chaining. */
export function applyChromaKeyToPixels(
  pixels: Uint8ClampedArray,
  params: ChromaKeyParams,
): Uint8ClampedArray {
  const key = parseHexColor(params.keyColor);
  const threshold = clamp01Finite(params.threshold, 0);
  // Avoid divide-by-zero in the softness branch — a 0-softness key gets
  // a 1px-wide ramp window which collapses to "below threshold".
  const softness = Math.max(0.0001, clamp01Finite(params.softness, 0));
  const spill = clamp01Finite(params.spillSuppression ?? 0, 0);
  const keyYCbCr = rgbToYCbCr(key[0], key[1], key[2]);

  for (let i = 0; i < pixels.length; i += 4) {
    const yc = rgbToYCbCr(pixels[i], pixels[i + 1], pixels[i + 2]);
    const dCb = yc[1] - keyYCbCr[1];
    const dCr = yc[2] - keyYCbCr[2];
    const dist = Math.sqrt(dCb * dCb + dCr * dCr) / 127;

    if (dist < threshold) {
      pixels[i + 3] = 0;
      continue;
    }
    if (dist < threshold + softness) {
      const t = (dist - threshold) / softness;
      pixels[i + 3] = Math.round(pixels[i + 3] * t);
    }
    if (spill > 0) {
      const pull = Math.max(0, 1 - dist) * spill;
      const newCb = yc[1] + (128 - yc[1]) * pull;
      const newCr = yc[2] + (128 - yc[2]) * pull;
      const rgb = yCbCrToRgb(yc[0], newCb, newCr);
      pixels[i] = rgb[0];
      pixels[i + 1] = rgb[1];
      pixels[i + 2] = rgb[2];
    }
  }
  return pixels;
}

/** Parse `#rrggbb` (or `#rgb`) into a 0..255 RGB triple. Returns
 *  [0,255,0] for any unparseable input so a typo defaults to the most
 *  common chroma colour (bright green). */
export function parseHexColor(hex: string): [number, number, number] {
  if (typeof hex !== "string") return [0, 255, 0];
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 255, 0];
  let body = m[1];
  if (body.length === 3) body = body.split("").map((c) => c + c).join("");
  const n = parseInt(body, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function rgbToYCbCr(r: number, g: number, b: number): [number, number, number] {
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
