/**
 * Tests for the selection-shape contract (rect / path / mask). The
 * engine functions themselves touch HTMLCanvasElement / ImageData
 * which jsdom doesn't implement; full pixel-output coverage lives in
 * the Playwright integration suite. These tests pin the dispatch
 * shape so a future Photoshop-shaped tool (elliptical marquee,
 * polygonal lasso) can plug in without breaking the chips' Delete /
 * Fill / AI-inpaint flows.
 *
 * Run: vitest run lib/studio/drawing/__tests__/drawing-engine-selections.test.ts
 */

import { describe, it, expect } from "vitest";
import type { MarqueeSelection } from "@/lib/studio/drawing/drawing-engine";

describe("MarqueeSelection — shape discrimination", () => {
  it("rect form carries x/y/w/h", () => {
    const sel: MarqueeSelection = { kind: "rect", x: 1, y: 2, width: 3, height: 4 };
    expect(sel.kind).toBe("rect");
    if (sel.kind === "rect") {
      expect(sel.x).toBe(1);
      expect(sel.y).toBe(2);
      expect(sel.width).toBe(3);
      expect(sel.height).toBe(4);
    }
  });

  it("path form carries an ordered points array", () => {
    const sel: MarqueeSelection = {
      kind: "path",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
    };
    if (sel.kind === "path") {
      expect(sel.points.length).toBe(3);
      expect(sel.points[0]).toEqual({ x: 0, y: 0 });
    }
  });

  it("mask form carries an ImageData-shaped object", () => {
    // jsdom has no `ImageData` constructor; stub the shape so the
    // type-discriminator test passes without depending on the browser
    // canvas API.
    const mask = { width: 4, height: 4, data: new Uint8ClampedArray(64), colorSpace: "srgb" as const };
    const sel: MarqueeSelection = { kind: "mask", mask: mask as unknown as ImageData };
    if (sel.kind === "mask") {
      expect(sel.mask.width).toBe(4);
      expect(sel.mask.height).toBe(4);
      expect(sel.mask.data.length).toBe(64);
    }
  });

  it("union is exhaustive over the three shapes — adding a new kind would force this test to break first", () => {
    const samples: MarqueeSelection[] = [
      { kind: "rect", x: 0, y: 0, width: 1, height: 1 },
      { kind: "path", points: [{ x: 0, y: 0 }] },
      {
        kind: "mask",
        mask: {
          width: 1,
          height: 1,
          data: new Uint8ClampedArray(4),
          colorSpace: "srgb" as const,
        } as unknown as ImageData,
      },
    ];
    for (const sel of samples) {
      // Force exhaustive check at the compiler level — the switch
      // below has no `default` so an unhandled kind would TS-error.
      const summary = (s: MarqueeSelection): string => {
        switch (s.kind) {
          case "rect":
            return `rect ${s.width}x${s.height}`;
          case "path":
            return `path ${s.points.length}`;
          case "mask":
            return `mask ${s.mask.width}x${s.mask.height}`;
        }
      };
      expect(typeof summary(sel)).toBe("string");
    }
  });
});
