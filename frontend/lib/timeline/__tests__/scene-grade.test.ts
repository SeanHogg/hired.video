/**
 * Scene filter effect (`canvas-v2:scene-grade`, #583) — the one filter path
 * the preview overlay and the export share.
 *
 *   - ctx.filter path: asserted at the draw-call level against a recording
 *     context (jsdom can't rasterise CSS filters) — the composite is
 *     snapshotted into ONE reused scratch canvas and redrawn through
 *     `filtersToCss(filters)`.
 *   - pixel-math fallback (no ctx.filter, older Safari): asserted on real
 *     pixels via PixelCanvas against the W3C filter definitions.
 *
 * Run: vitest run lib/timeline/__tests__/scene-grade.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyEffects } from "@/lib/timeline/effects";
import { applySceneFilters, supportsCanvasFilter } from "@/lib/timeline/effects/scene-grade";
import { boxesForGauss, filterSteps } from "@/lib/timeline/effects/filter-pixels";
import { DEFAULT_FILTERS, SCENE_GRADE_EFFECT, filtersToCss, type VideoFilters } from "@/lib/studio/video-filters";
import { PixelCanvas } from "./pixel-canvas";

type Call = { op: string; filter?: string; src?: unknown };

function recordingTarget(width = 320, height = 180) {
  const calls: Call[] = [];
  const ctx = {
    filter: "none",
    save: () => calls.push({ op: "save" }),
    restore: () => calls.push({ op: "restore" }),
    clearRect: () => calls.push({ op: "clearRect" }),
    drawImage: (src: unknown) => calls.push({ op: "drawImage", filter: ctx.filter, src }),
    getImageData: vi.fn(),
    putImageData: vi.fn(),
  };
  const canvas = { width, height, getContext: () => ctx };
  return { calls, ctx, canvas };
}

const scratches: Array<ReturnType<typeof recordingTarget>> = [];
class FakeOffscreen {
  readonly rec: ReturnType<typeof recordingTarget>;
  constructor(public width: number, public height: number) {
    this.rec = recordingTarget(width, height);
    scratches.push(this.rec);
  }
  getContext() {
    return this.rec.ctx;
  }
}

const graded: VideoFilters = { ...DEFAULT_FILTERS, brightness: 1.2, contrast: 0.9, warmth: 0.3 };

beforeEach(() => {
  scratches.length = 0;
  vi.stubGlobal("OffscreenCanvas", FakeOffscreen);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("scene filters — ctx.filter path", () => {
  it("redraws the composite through filtersToCss(filters)", () => {
    const { calls, ctx, canvas } = recordingTarget();
    expect(supportsCanvasFilter(ctx as unknown as CanvasRenderingContext2D)).toBe(true);
    applySceneFilters(ctx as unknown as CanvasRenderingContext2D, canvas as unknown as HTMLCanvasElement, graded);
    expect(scratches).toHaveLength(1);
    // Snapshot the target into the scratch, then draw the scratch back filtered.
    expect(scratches[0].calls.map((c) => c.op)).toEqual(["clearRect", "drawImage"]);
    expect(scratches[0].calls[1].src).toBe(canvas);
    expect(calls.map((c) => c.op)).toEqual(["save", "drawImage", "restore"]);
    expect(calls[1].filter).toBe(filtersToCss(graded));
    expect(calls[1].src).toBeInstanceOf(FakeOffscreen);
  });

  it("reuses one scratch canvas per target across frames", () => {
    const target = recordingTarget();
    const other = recordingTarget();
    for (let frame = 0; frame < 30; frame++) {
      applySceneFilters(target.ctx as unknown as CanvasRenderingContext2D, target.canvas as unknown as HTMLCanvasElement, graded);
    }
    applySceneFilters(other.ctx as unknown as CanvasRenderingContext2D, other.canvas as unknown as HTMLCanvasElement, graded);
    expect(scratches).toHaveLength(2);
  });

  it("does nothing for identity, missing or empty filters", () => {
    const { calls, ctx, canvas } = recordingTarget();
    const c = ctx as unknown as CanvasRenderingContext2D;
    const el = canvas as unknown as HTMLCanvasElement;
    applySceneFilters(c, el, DEFAULT_FILTERS);
    applySceneFilters(c, el, null);
    applySceneFilters(c, el, {});
    expect(calls).toEqual([]);
    expect(scratches).toHaveLength(0);
  });

  it("runs through the effect registry under the scene-grade id", () => {
    const { calls, ctx, canvas } = recordingTarget();
    applyEffects([{ kind: SCENE_GRADE_EFFECT, params: { filters: { brightness: 0.8 } } }], {
      ctx: ctx as unknown as CanvasRenderingContext2D,
      canvas: canvas as unknown as HTMLCanvasElement,
      timelineFrame: 0,
      clipFrame: 0,
      clipDurationFrames: 30,
      fps: 30,
    });
    // A partial filter object is completed with defaults before grading.
    expect(calls[1].filter).toBe(filtersToCss({ ...DEFAULT_FILTERS, brightness: 0.8 }));
  });
});

/** A solid-colour PixelCanvas graded through the fallback. */
function gradeSolid(rgb: [number, number, number], filters: Partial<VideoFilters>, size = 8): PixelCanvas {
  const canvas = new PixelCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},1)`;
  ctx.fillRect(0, 0, size, size);
  applySceneFilters(ctx as unknown as CanvasRenderingContext2D, canvas as unknown as HTMLCanvasElement, filters);
  return canvas;
}

describe("scene filters — pixel-math fallback (no ctx.filter)", () => {
  it("takes the fallback when the context has no filter property", () => {
    const canvas = new PixelCanvas(2, 2);
    expect(supportsCanvasFilter(canvas.getContext("2d") as unknown as CanvasRenderingContext2D)).toBe(false);
  });

  it("brightness scales each channel", () => {
    expect(gradeSolid([200, 100, 50], { brightness: 0.5 }).pixel(0, 0)).toEqual([100, 50, 25, 255]);
    // Clamped at white.
    expect(gradeSolid([200, 100, 50], { brightness: 2 }).pixel(0, 0)).toEqual([255, 200, 100, 255]);
  });

  it("contrast 0 collapses to mid grey", () => {
    expect(gradeSolid([10, 200, 90], { contrast: 0 }).pixel(3, 3)).toEqual([128, 128, 128, 255]);
  });

  it("saturation 0 is the luminance grey (0.213 / 0.715 / 0.072)", () => {
    const y = Math.round(0.213 * 255);
    expect(gradeSolid([255, 0, 0], { saturation: 0 }).pixel(0, 0)).toEqual([y, y, y, 255]);
  });

  it("hue 0 / warmth 0 / blur 0 are identity", () => {
    expect(filterSteps({ hue: 0, warmth: 0, blur: 0 }).filter((s) => s.kind === "blur")).toHaveLength(0);
    expect(gradeSolid([12, 34, 56], { ...DEFAULT_FILTERS, hue: 0 }).pixel(0, 0)).toEqual([12, 34, 56, 255]);
  });

  it("warmth is sepia: white turns cream", () => {
    // sepia(1) of white = (1.351, 1.203, 0.937) → clamped (255, 255, 239).
    expect(gradeSolid([255, 255, 255], { warmth: 1 }).pixel(0, 0)).toEqual([255, 255, 239, 255]);
  });

  it("blur keeps a flat field flat and softens an edge", () => {
    expect(gradeSolid([40, 80, 120], { blur: 3 }, 12).pixel(6, 6)).toEqual([40, 80, 120, 255]);

    const edge = new PixelCanvas(16, 4);
    const ctx = edge.getContext("2d");
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, 16, 4);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(8, 0, 8, 4);
    applySceneFilters(ctx as unknown as CanvasRenderingContext2D, edge as unknown as HTMLCanvasElement, { blur: 2 });
    const left = edge.pixel(7, 1)[0];
    const right = edge.pixel(8, 1)[0];
    expect(left).toBeGreaterThan(0);
    expect(right).toBeLessThan(255);
    expect(edge.pixel(0, 1)[0]).toBeLessThan(left);
    expect(edge.pixel(15, 1)[0]).toBeGreaterThan(right);
  });

  it("box sizes approximate the Gaussian (odd widths, growing with sigma)", () => {
    const small = boxesForGauss(1);
    const large = boxesForGauss(8);
    for (const w of [...small, ...large]) expect(w % 2).toBe(1);
    expect(large[0]).toBeGreaterThan(small[0]);
  });

  it("applies steps in the CSS string's order", () => {
    const kinds = filterSteps({ brightness: 1.1, blur: 1, warmth: -0.5 }).map((s) => s.kind);
    // brightness, contrast, saturate, hue-rotate, blur, sepia, hue-rotate
    expect(kinds).toEqual(["matrix", "matrix", "matrix", "matrix", "blur", "matrix", "matrix"]);
  });
});
