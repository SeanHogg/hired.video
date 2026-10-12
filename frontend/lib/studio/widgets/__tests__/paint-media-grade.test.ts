/**
 * Per-widget colour grades on media ops (#2393).
 *
 *   - ctx.filter path: `ctx.filter` is set to the CSS string.
 *   - no ctx.filter (Safari < 18): structured `grade` is applied through
 *     the same pixel-math fallback scene grades already use.
 *
 * Run: vitest run lib/studio/widgets/__tests__/paint-media-grade.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FILTERS, filtersToCss, type VideoFilters } from "@/lib/studio/video-filters";
import { paintOps, type PaintMedia, type PaintableImage } from "@/lib/studio/widgets/paint-ops";
import type { DrawOp } from "@/lib/studio/widgets/draw-ops";
import type { Ctx2D } from "@/lib/studio/widgets/frame-canvas";

const graded: VideoFilters = { ...DEFAULT_FILTERS, brightness: 1.2 };
const css = filtersToCss(graded);
const img = { naturalWidth: 10, naturalHeight: 10 } as PaintableImage;
const media: PaintMedia = { image: () => img, video: () => null };
const op: DrawOp = {
  op: "media",
  media: "image",
  url: "https://example.com/a.png",
  box: { x: 0, y: 0, w: 10, h: 10 },
  fit: "stretch",
  filter: css,
  grade: graded,
};

type Call = { op: string; filter?: unknown; src?: unknown };

function recordingCtx(withFilter: boolean) {
  const calls: Call[] = [];
  const ctx: Record<string, unknown> = {
    save: () => calls.push({ op: "save" }),
    restore: () => calls.push({ op: "restore" }),
    beginPath: () => calls.push({ op: "beginPath" }),
    rect: () => calls.push({ op: "rect" }),
    clip: () => calls.push({ op: "clip" }),
    drawImage: (src: unknown) => calls.push({ op: "drawImage", filter: ctx.filter, src }),
    translate: () => calls.push({ op: "translate" }),
    scale: () => calls.push({ op: "scale" }),
  };
  if (withFilter) ctx.filter = "none";
  return { calls, ctx: ctx as unknown as Ctx2D };
}

class FakeOffscreen {
  width: number;
  height: number;
  ctx = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({
      data: new Uint8ClampedArray(10 * 10 * 4).fill(128),
      width: 10,
      height: 10,
    })),
    putImageData: vi.fn(),
  };
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  getContext() {
    return this.ctx;
  }
}

beforeEach(() => {
  vi.stubGlobal("OffscreenCanvas", FakeOffscreen);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("paintMedia widget grade", () => {
  it("sets ctx.filter when the context supports it", () => {
    const { calls, ctx } = recordingCtx(true);
    paintOps(ctx, [op], media);
    const draw = calls.find((c) => c.op === "drawImage");
    expect(draw?.filter).toBe(css);
    expect(draw?.src).toBe(img);
  });

  it("falls back to pixel math when ctx.filter is missing", () => {
    const { calls, ctx } = recordingCtx(false);
    paintOps(ctx, [op], media);
    const draw = calls.find((c) => c.op === "drawImage");
    expect(draw?.src).toBeInstanceOf(FakeOffscreen);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("widget filters use the pixel-math fallback"),
    );
  });

  it("draws the original when there is no grade and no ctx.filter", () => {
    const { calls, ctx } = recordingCtx(false);
    const plain: DrawOp = { ...op, filter: undefined, grade: undefined };
    paintOps(ctx, [plain], media);
    const draw = calls.find((c) => c.op === "drawImage");
    expect(draw?.src).toBe(img);
  });
});
