/**
 * Edge-aware quick-select (#1107).
 *
 * Photoshop's quick-select is not magic-wand: each brush dab still
 * flood-fills by colour tolerance, but a Sobel magnitude pass treats
 * strong edges as barriers so the fill cannot leak across a contour
 * even when the two sides are within tolerance.
 *
 * Pure RGBA buffers — no Canvas / ImageData — so vitest can pin the
 * pixels without jsdom. `quickSelectAccumulate` matches the drawing
 * engine's signature (`source.getImageData` + prior mask) so
 * `drawing-engine.ts` can re-export this body later.
 *
 * Run: vitest run lib/studio/widgets/__tests__/edge-aware-select.test.ts
 */

/** RGBA bitmap the algorithm reads and writes. Structurally an ImageData. */
export interface RgbaBuffer {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Anything that can yield a full-frame RGBA snapshot (Canvas 2D ctx). */
export interface PixelSource {
  getImageData(sx: number, sy: number, sw: number, sh: number): RgbaBuffer;
}

export interface QuickSelectOptions {
  /** Sobel magnitude at-or-above this (0..~1442 for 8-bit luma) is a barrier. */
  edgeThreshold?: number;
  /**
   * Limit the dab to a circular neighbourhood of this radius (canvas
   * pixels). Omit for an unbounded flood that still stops at edges.
   */
  radius?: number;
  /** Precomputed Sobel magnitude (length = width*height). Skips a pass. */
  edgeMagnitude?: Float32Array;
}

/** Colour-channel slack matching `magicWandMask`'s default. */
export const DEFAULT_COLOR_TOLERANCE = 24;

/**
 * A hard black/white step yields Sobel magnitude ≈ 1020. 80 catches
 * that and milder ink-on-paper edges without treating a 1–2 level
 * gradient as a wall.
 */
export const DEFAULT_EDGE_THRESHOLD = 80;

const LUMA_R = 0.299;
const LUMA_G = 0.587;
const LUMA_B = 0.114;

export function emptyMask(width: number, height: number): RgbaBuffer {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

/** Rec. 601 luma, premultiplied by alpha so a hole in the canvas is an edge. */
export function pixelLuma(data: Uint8ClampedArray, i: number): number {
  const a = data[i + 3] ?? 0;
  if (a === 0) return 0;
  const r = data[i] ?? 0;
  const g = data[i + 1] ?? 0;
  const b = data[i + 2] ?? 0;
  return (LUMA_R * r + LUMA_G * g + LUMA_B * b) * (a / 255);
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

/** Sobel 3×3 magnitude per pixel. Border samples replicate the edge. */
export function sobelMagnitude(source: RgbaBuffer): Float32Array {
  const { width, height, data } = source;
  const luma = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      luma[y * width + x] = pixelLuma(data, (y * width + x) * 4);
    }
  }
  const at = (x: number, y: number): number =>
    luma[clamp(y, 0, height - 1) * width + clamp(x, 0, width - 1)] ?? 0;
  const mag = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gx =
        -at(x - 1, y - 1) +
        at(x + 1, y - 1) +
        -2 * at(x - 1, y) +
        2 * at(x + 1, y) +
        -at(x - 1, y + 1) +
        at(x + 1, y + 1);
      const gy =
        -at(x - 1, y - 1) +
        -2 * at(x, y - 1) +
        -at(x + 1, y - 1) +
        at(x - 1, y + 1) +
        2 * at(x, y + 1) +
        at(x + 1, y + 1);
      mag[y * width + x] = Math.hypot(gx, gy);
    }
  }
  return mag;
}

function withinTolerance(
  data: Uint8ClampedArray,
  i: number,
  target: readonly [number, number, number, number],
  tolerance: number,
): boolean {
  return (
    Math.abs((data[i] ?? 0) - target[0]) <= tolerance &&
    Math.abs((data[i + 1] ?? 0) - target[1]) <= tolerance &&
    Math.abs((data[i + 2] ?? 0) - target[2]) <= tolerance &&
    Math.abs((data[i + 3] ?? 0) - target[3]) <= tolerance
  );
}

function markWhite(mask: Uint8ClampedArray, i: number): void {
  mask[i] = 255;
  mask[i + 1] = 255;
  mask[i + 2] = 255;
  mask[i + 3] = 255;
}

/**
 * Tolerance flood-fill gated by Sobel edges. The seed is always in the
 * mask (even if it sits on a contour); every other high-magnitude pixel
 * is included as a boundary but does not expand past itself.
 */
export function edgeAwareFloodMask(
  source: RgbaBuffer,
  startX: number,
  startY: number,
  tolerance = DEFAULT_COLOR_TOLERANCE,
  options: QuickSelectOptions = {},
): RgbaBuffer {
  const { width, height, data } = source;
  const mask = emptyMask(width, height);
  const x = Math.floor(startX);
  const y = Math.floor(startY);
  if (x < 0 || y < 0 || x >= width || y >= height) return mask;

  const edgeThreshold = options.edgeThreshold ?? DEFAULT_EDGE_THRESHOLD;
  const radius = options.radius;
  const radiusSq = radius == null ? null : radius * radius;
  const mag = options.edgeMagnitude ?? sobelMagnitude(source);
  const m = mask.data;
  const startI = (y * width + x) * 4;
  const target: [number, number, number, number] = [
    data[startI] ?? 0,
    data[startI + 1] ?? 0,
    data[startI + 2] ?? 0,
    data[startI + 3] ?? 0,
  ];

  const stack: Array<[number, number]> = [[x, y]];
  while (stack.length > 0) {
    const popped = stack.pop();
    if (!popped) break;
    const [cx, cy] = popped;
    if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue;
    if (radiusSq != null) {
      const dx = cx - x;
      const dy = cy - y;
      if (dx * dx + dy * dy > radiusSq) continue;
    }
    const i = (cy * width + cx) * 4;
    if (m[i + 3] === 255) continue;
    if (!withinTolerance(data, i, target, tolerance)) continue;
    markWhite(m, i);
    const isSeed = cx === x && cy === y;
    const strength = mag[cy * width + cx] ?? 0;
    if (!isSeed && strength >= edgeThreshold) continue;
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return mask;
}

/** Mutation-safe union of two alpha masks (alpha 255 = selected). */
export function unionMasks(a: RgbaBuffer, b: RgbaBuffer): RgbaBuffer {
  const width = a.width;
  const height = a.height;
  const combined = emptyMask(width, height);
  const out = combined.data;
  const ad = a.data;
  const bd = b.data;
  const n = Math.min(out.length, ad.length, bd.length);
  for (let i = 0; i < n; i += 4) {
    const mark = Math.max(ad[i + 3] ?? 0, bd[i + 3] ?? 0) === 255;
    if (!mark) continue;
    markWhite(out, i);
  }
  return combined;
}

/**
 * Quick-select grow — add an edge-gated flood (centred at the pointer)
 * to an existing mask. Same argument order as drawing-engine's
 * `quickSelectAccumulate` so the engine can switch the body later.
 */
export function quickSelectAccumulate(
  source: PixelSource,
  width: number,
  height: number,
  startX: number,
  startY: number,
  tolerance: number,
  prior: RgbaBuffer | null,
  options: QuickSelectOptions = {},
): RgbaBuffer {
  const frame = source.getImageData(0, 0, width, height);
  const dab = edgeAwareFloodMask(frame, startX, startY, tolerance, options);
  if (!prior) return dab;
  return unionMasks(prior, dab);
}
