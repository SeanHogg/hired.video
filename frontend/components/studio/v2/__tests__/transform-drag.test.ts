/**
 * The one move / resize / rotate math (#1101) shared by DrawingStage's
 * <TransformHandles/> and the studio widget chrome.
 *
 * Run: vitest run components/studio/v2/__tests__/transform-drag.test.ts
 */
import { describe, expect, it } from "vitest";
import { dragRect } from "../useTransformDrag";

const stageRect = { left: 100, top: 50, width: 800, height: 450 } as DOMRect;
const FRACTION_STAGE = { width: 1, height: 1 };
const start = (mode: "move" | "resize" | "rotate", rotation = 0) => ({
  mode,
  startClientX: 500,
  startClientY: 275,
  startRect: { x: 0.25, y: 0.25, width: 0.5, height: 0.5, rotation },
  stageRect,
});

describe("dragRect", () => {
  it("moves by the pointer delta in stage units, independent of zoom", () => {
    const next = dragRect(start("move"), { x: 580, y: 320 }, FRACTION_STAGE, 0.02);
    expect(next.x).toBeCloseTo(0.35);
    expect(next.y).toBeCloseTo(0.35);
    expect(next.width).toBe(0.5);
  });

  it("resizes along the rect's own axes when rotated", () => {
    // Rotated 90°: dragging screen-down grows the local width.
    const next = dragRect(start("resize", 90), { x: 500, y: 320 }, FRACTION_STAGE, 0.02);
    expect(next.width).toBeCloseTo(0.6);
    expect(next.height).toBeCloseTo(0.5);
  });

  it("never shrinks below the minimum size", () => {
    const next = dragRect(start("resize"), { x: 0, y: 0 }, FRACTION_STAGE, 0.02);
    expect(next).toMatchObject({ width: 0.02, height: 0.02 });
  });

  it("rotates by the pointer's angle around the centre", () => {
    // Centre is at (500, 275); start straight right of it, end straight below.
    const s = { ...start("rotate"), startClientX: 600, startClientY: 275 };
    expect(dragRect(s, { x: 500, y: 375 }, FRACTION_STAGE, 0.02).rotation).toBeCloseTo(90);
  });
});
