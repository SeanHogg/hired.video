/**
 * Catalog lookup tests for `findFormatByDimensions`.
 *
 * The helper is the v2 picker / SafeZoneOverlay seam: CanvasState stores
 * raw pixels, and this function maps them back onto a VIDEO_FORMATS row
 * (or null for a custom size). Exact width+height match only — swapped
 * portrait/landscape pairs are distinct presets.
 *
 * Run: vitest run lib/studio/__tests__/video-formats.test.ts
 */

import { describe, it, expect } from "vitest";
import {
  VIDEO_FORMATS,
  findFormatByDimensions,
} from "../video-formats";

describe("findFormatByDimensions", () => {
  it("returns landscape 1080p for 1920×1080", () => {
    const format = findFormatByDimensions(1920, 1080);
    expect(format?.id).toBe("landscape-1080p");
    expect(format?.width).toBe(1920);
    expect(format?.height).toBe(1080);
  });

  it("returns portrait 1080p for 1080×1920 (not the landscape pair)", () => {
    const format = findFormatByDimensions(1080, 1920);
    expect(format?.id).toBe("portrait-1080p");
  });

  it("returns the IAB medium rectangle for 300×250", () => {
    const format = findFormatByDimensions(300, 250);
    expect(format?.id).toBe("iab-medium-rectangle");
    expect(format?.category).toBe("display-ad");
  });

  it("returns square 1080p for 1080×1080", () => {
    expect(findFormatByDimensions(1080, 1080)?.id).toBe("square-1080p");
  });

  it("returns null when no catalog entry matches (custom dimensions)", () => {
    expect(findFormatByDimensions(123, 456)).toBeNull();
    expect(findFormatByDimensions(0, 0)).toBeNull();
    expect(findFormatByDimensions(1920, 1081)).toBeNull();
  });

  it("finds every VIDEO_FORMATS row by its own pixels", () => {
    for (const preset of VIDEO_FORMATS) {
      expect(findFormatByDimensions(preset.width, preset.height)?.id).toBe(
        preset.id,
      );
    }
  });
});
