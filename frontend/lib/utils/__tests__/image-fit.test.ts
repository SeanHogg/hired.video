/**
 * Tests for the shared image-fit math extracted per the DRY rule —
 * previously these calculations lived in three places (headshot-engine.ts,
 * DrawingStage.tsx, and an inline letterbox in frame-renderer.ts).
 *
 * `cover` fills the destination (source may overflow). `contain` letterboxes
 * (source fits entirely; whitespace may appear on the short axis). Both
 * centre the source.
 *
 * Run: vitest run lib/utils/__tests__/image-fit.test.ts
 */

import { describe, it, expect } from "vitest";
import { containRect, coverRect } from "@/lib/utils/image-fit";

describe("containRect — letterbox", () => {
  it("identity when source and dest match exactly", () => {
    expect(containRect(100, 100, 100, 100)).toEqual({ dx: 0, dy: 0, dw: 100, dh: 100 });
  });
  it("landscape source on portrait dest letterboxes top/bottom", () => {
    // 200×100 source (2:1) into 100×100 dest → fits to width 100, height 50, centered vertically.
    expect(containRect(200, 100, 100, 100)).toEqual({ dx: 0, dy: 25, dw: 100, dh: 50 });
  });
  it("portrait source on landscape dest letterboxes left/right", () => {
    // 100×200 source (1:2) into 200×100 dest → fits to height 100, width 50, centered horizontally.
    expect(containRect(100, 200, 200, 100)).toEqual({ dx: 75, dy: 0, dw: 50, dh: 100 });
  });
  it("returns the dest rect when the source has zero dimensions (defensive)", () => {
    expect(containRect(0, 0, 100, 100)).toEqual({ dx: 0, dy: 0, dw: 100, dh: 100 });
  });
});

describe("coverRect — fill, may overflow", () => {
  it("identity when source and dest match exactly", () => {
    expect(coverRect(100, 100, 100, 100)).toEqual({ dx: 0, dy: 0, dw: 100, dh: 100 });
  });
  it("landscape source on portrait dest overflows horizontally so dest fills vertically", () => {
    // 200×100 source (2:1) into 100×100 dest → height 100, width 200, centred horizontally → dx = -50.
    expect(coverRect(200, 100, 100, 100)).toEqual({ dx: -50, dy: 0, dw: 200, dh: 100 });
  });
  it("portrait source on landscape dest overflows vertically so dest fills horizontally", () => {
    // 100×200 source (1:2) into 200×100 dest → width 200, height 400, centred vertically → dy = -150.
    expect(coverRect(100, 200, 200, 100)).toEqual({ dx: 0, dy: -150, dw: 200, dh: 400 });
  });
  it("returns the dest rect when the source has zero dimensions (defensive)", () => {
    expect(coverRect(0, 0, 100, 100)).toEqual({ dx: 0, dy: 0, dw: 100, dh: 100 });
  });
});
