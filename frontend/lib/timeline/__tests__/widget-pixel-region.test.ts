/**
 * The per-widget pixel pass covers only the on-canvas part of the widget:
 * a widget hanging off the left / top edge must not have its effects spill
 * past its own right / bottom edge.
 *
 * Run: vitest run lib/timeline/__tests__/widget-pixel-region.test.ts
 */
import { describe, expect, it } from "vitest";
import { pixelPassRegion } from "@/lib/timeline/effects/widget-frame";

const CANVAS = { width: 1280, height: 720 };

describe("pixelPassRegion", () => {
  it("keeps a widget fully inside the canvas as-is (rounded outward)", () => {
    expect(pixelPassRegion({ x: 100.4, y: 50.6, w: 200.2, h: 99.1 }, CANVAS)).toEqual({ sx: 100, sy: 50, sw: 201, sh: 100 });
  });

  it("covers only the visible part of a widget off the left / top edge", () => {
    // x = -50, w = 100 → 0..50, not 0..100.
    expect(pixelPassRegion({ x: -50, y: -30, w: 100, h: 80 }, CANVAS)).toEqual({ sx: 0, sy: 0, sw: 50, sh: 50 });
  });

  it("clips a full-bleed widget scaled past every edge to the canvas", () => {
    expect(pixelPassRegion({ x: -64, y: -36, w: 1408, h: 792 }, CANVAS)).toEqual({ sx: 0, sy: 0, sw: 1280, sh: 720 });
  });

  it("skips a widget entirely off the canvas", () => {
    expect(pixelPassRegion({ x: -200, y: 10, w: 150, h: 100 }, CANVAS)).toBeNull();
    expect(pixelPassRegion({ x: 10, y: 800, w: 150, h: 100 }, CANVAS)).toBeNull();
    expect(pixelPassRegion({ x: 1300, y: 10, w: 150, h: 100 }, CANVAS)).toBeNull();
  });
});
