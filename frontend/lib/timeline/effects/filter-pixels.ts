/**
 * Pixel-math implementation of the scene colour filters
 * (`VideoFilters`, lib/studio/video-filters.ts) for browsers whose 2D
 * context has no `ctx.filter` (Safari before 18). The scene filter effect
 * (scene-grade.ts) uses `ctx.filter = filtersToCss(...)` where it exists and
 * this module everywhere else, so an older Safari still previews and exports
 * the grade instead of silently dropping it.
 *
 * The math is the W3C Filter Effects definition of each CSS function the
 * filter maps to (brightness / contrast / saturate / hue-rotate / sepia are
 * colour matrices; blur is a Gaussian with stdDeviation = the px value,
 * approximated by three box blurs). Steps run in `FILTER_DEFS` order — the
 * same order `filtersToCss` joins them — clamping to 0..255 between steps
 * like the CSS pipeline does.
 */
import { DEFAULT_FILTERS, FILTER_DEFS, type VideoFilters } from "@/lib/studio/video-filters";

/** out = M · rgb + offset (8-bit channel space). */
interface MatrixStep {
  kind: "matrix";
  m: readonly number[];
  offset: number;
}
interface BlurStep {
  kind: "blur";
  sigma: number;
}
type FilterStep = MatrixStep | BlurStep;

function scale(a: number): MatrixStep {
  return { kind: "matrix", m: [a, 0, 0, 0, a, 0, 0, 0, a], offset: 0 };
}

function saturate(s: number): MatrixStep {
  return {
    kind: "matrix",
    m: [
      0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
      0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
      0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s,
    ],
    offset: 0,
  };
}

function hueRotate(deg: number): MatrixStep {
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return {
    kind: "matrix",
    m: [
      0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
      0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
      0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
    ],
    offset: 0,
  };
}

function sepia(amount: number): MatrixStep {
  const a = 1 - Math.max(0, Math.min(1, amount));
  return {
    kind: "matrix",
    m: [
      0.393 + 0.607 * a, 0.769 - 0.769 * a, 0.189 - 0.189 * a,
      0.349 - 0.349 * a, 0.686 + 0.314 * a, 0.168 - 0.168 * a,
      0.272 - 0.272 * a, 0.534 - 0.534 * a, 0.131 + 0.869 * a,
    ],
    offset: 0,
  };
}

/** The steps for one filter slider — mirrors that slider's `toCss`. */
const STEPS_FOR: Record<keyof VideoFilters, (v: number) => FilterStep[]> = {
  brightness: (v) => [scale(v)],
  contrast: (v) => [{ ...scale(v), offset: 255 * (0.5 - 0.5 * v) }],
  saturation: (v) => [saturate(v)],
  hue: (v) => [hueRotate(v)],
  blur: (v) => (v > 0 ? [{ kind: "blur", sigma: v }] : []),
  // `sepia(|v|) hue-rotate(v > 0 ? 0 : -25deg)`; v = 0 emits nothing.
  warmth: (v) => (v === 0 ? [] : [sepia(Math.abs(v)), hueRotate(v > 0 ? 0 : -25)]),
};

/** Ordered pixel steps for `filters`, in the CSS string's order. */
export function filterSteps(filters: Partial<VideoFilters>): FilterStep[] {
  const full: VideoFilters = { ...DEFAULT_FILTERS, ...filters };
  return FILTER_DEFS.flatMap((def) => STEPS_FOR[def.id](full[def.id]));
}

// Float working buffers, grown on demand and reused across frames.
let bufA = new Float32Array(0);
let bufB = new Float32Array(0);

function ensureBuffers(length: number): void {
  if (bufA.length < length) {
    bufA = new Float32Array(length);
    bufB = new Float32Array(length);
  }
}

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

function applyMatrix(buf: Float32Array, length: number, step: MatrixStep): void {
  const [a, b, c, d, e, f, g, h, i] = step.m;
  const o = step.offset;
  for (let p = 0; p < length; p += 4) {
    const r = buf[p];
    const gr = buf[p + 1];
    const bl = buf[p + 2];
    buf[p] = clamp255(a * r + b * gr + c * bl + o);
    buf[p + 1] = clamp255(d * r + e * gr + f * bl + o);
    buf[p + 2] = clamp255(g * r + h * gr + i * bl + o);
  }
}

/** Box sizes whose triple convolution approximates a Gaussian of `sigma`. */
export function boxesForGauss(sigma: number, n = 3): number[] {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const mIdeal = (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4);
  const m = Math.round(mIdeal);
  return Array.from({ length: n }, (_, k) => (k < m ? wl : wu));
}

/** One separable box pass along x (`horizontal`) or y, clamp-to-edge. */
function boxPass(src: Float32Array, dst: Float32Array, w: number, h: number, r: number, horizontal: boolean): void {
  const lines = horizontal ? h : w;
  const len = horizontal ? w : h;
  const stride = horizontal ? 4 : w * 4;
  const norm = 1 / (2 * r + 1);
  for (let line = 0; line < lines; line++) {
    const base = horizontal ? line * w * 4 : line * 4;
    for (let ch = 0; ch < 4; ch++) {
      const at = (k: number) => src[base + Math.max(0, Math.min(len - 1, k)) * stride + ch];
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += at(k);
      for (let k = 0; k < len; k++) {
        dst[base + k * stride + ch] = acc * norm;
        acc += at(k + r + 1) - at(k - r);
      }
    }
  }
}

function applyBlur(w: number, h: number, sigma: number): void {
  for (const size of boxesForGauss(sigma)) {
    const r = Math.max(0, Math.floor((size - 1) / 2));
    if (r === 0) continue;
    boxPass(bufA, bufB, w, h, r, true);
    boxPass(bufB, bufA, w, h, r, false);
  }
}

/** Grade `data` (RGBA, unpremultiplied, as getImageData returns) in place. */
export function applyFiltersToPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  filters: Partial<VideoFilters>,
): void {
  const steps = filterSteps(filters);
  if (steps.length === 0) return;
  const length = width * height * 4;
  ensureBuffers(length);
  for (let p = 0; p < length; p++) bufA[p] = data[p];
  for (const step of steps) {
    if (step.kind === "blur") applyBlur(width, height, step.sigma);
    else applyMatrix(bufA, length, step);
  }
  for (let p = 0; p < length; p++) data[p] = bufA[p];
}
