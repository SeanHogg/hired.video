/**
 * Tests for the shared color primitives extracted per the DRY rule —
 * previously the same hex-parse logic lived in three places (overlays.ts,
 * drawing-engine.ts, headshot-engine.ts). These tests pin the contracts
 * so a future refactor can't silently drift any caller.
 *
 * Run: vitest run lib/utils/__tests__/color.test.ts
 */

import { describe, it, expect } from "vitest";
import {
  parseHex,
  parseHexToRgba,
  rgbToHex,
  hexToRgbaString,
  rgbaWithinTolerance,
} from "@/lib/utils/color";

describe("parseHex", () => {
  it("parses #rrggbb (lowercase)", () => {
    expect(parseHex("#abcdef")).toEqual({ r: 0xab, g: 0xcd, b: 0xef });
  });
  it("parses #RRGGBB (uppercase)", () => {
    expect(parseHex("#FF8800")).toEqual({ r: 255, g: 136, b: 0 });
  });
  it("parses without the leading hash", () => {
    expect(parseHex("112233")).toEqual({ r: 0x11, g: 0x22, b: 0x33 });
  });
  it("returns null on a malformed string", () => {
    expect(parseHex("not a color")).toBeNull();
    expect(parseHex("#fff")).toBeNull(); // 3-digit short-form not supported (deliberate)
    expect(parseHex("#fffggg")).toBeNull();
  });
});

describe("parseHexToRgba", () => {
  it("returns a [r,g,b,255] tuple for valid hex", () => {
    expect(parseHexToRgba("#80c0ff")).toEqual([0x80, 0xc0, 0xff, 255]);
  });
  it("falls back to opaque white on malformed input", () => {
    expect(parseHexToRgba("garbage")).toEqual([255, 255, 255, 255]);
  });
});

describe("rgbToHex", () => {
  it("zero-pads single-digit hex channels", () => {
    expect(rgbToHex(0, 1, 15)).toBe("#00010f");
  });
  it("round-trips with parseHex", () => {
    const c = parseHex("#bada55");
    expect(c).not.toBeNull();
    if (c) expect(rgbToHex(c.r, c.g, c.b)).toBe("#bada55");
  });
  it("clamps values outside 0..255 so a buggy caller can't produce garbage hex", () => {
    expect(rgbToHex(-10, 300, 128)).toBe("#00ff80");
  });
});

describe("hexToRgbaString", () => {
  it("produces an rgba() string with the supplied alpha", () => {
    expect(hexToRgbaString("#ff8000", 0.5)).toBe("rgba(255,128,0,0.5)");
  });
  it("falls back to opaque white on malformed input (matches the long-standing overlays.ts contract)", () => {
    expect(hexToRgbaString("not-a-color", 0.3)).toBe("rgba(255,255,255,0.3)");
  });
});

describe("rgbaWithinTolerance", () => {
  it("returns true on exact match with tolerance 0", () => {
    expect(rgbaWithinTolerance([10, 20, 30, 40], [10, 20, 30, 40], 0)).toBe(true);
  });
  it("returns false on any channel difference when tolerance is 0", () => {
    expect(rgbaWithinTolerance([10, 20, 30, 40], [10, 20, 30, 41], 0)).toBe(false);
  });
  it("returns true when every channel is within tolerance", () => {
    expect(rgbaWithinTolerance([100, 100, 100, 255], [110, 95, 105, 250], 16)).toBe(true);
  });
  it("returns false when any one channel exceeds tolerance", () => {
    expect(rgbaWithinTolerance([100, 100, 100, 255], [130, 100, 100, 255], 16)).toBe(false);
  });
});
