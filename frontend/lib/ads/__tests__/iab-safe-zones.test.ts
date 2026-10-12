/**
 * IAB / GDN display-ad safe-zone insets (#1131).
 *
 * Run: vitest run lib/ads/__tests__/iab-safe-zones.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  IAB_TAP_TARGET_PX,
  GDN_CREATIVE_MARGIN,
  displayAdSafeZones,
  isIabDisplayAdSize,
  mobileTapVerticalInset,
  safeZoneInnerRect,
  safeZonesForDisplayAdFormat,
} from "../iab-safe-zones";
import { findFormatByDimensions } from "@/lib/studio/video-formats";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

describe("displayAdSafeZones", () => {
  it("returns nothing for non-IAB canvas sizes (16:9, custom)", () => {
    expect(displayAdSafeZones(1920, 1080)).toEqual([]);
    expect(displayAdSafeZones(123, 456)).toEqual([]);
  });

  it("320×50 mobile banner: inner tap-target height is ≥ 44px", () => {
    const zones = displayAdSafeZones(320, 50);
    expect(zones).toHaveLength(1);
    expect(zones[0].kind).toBe("title-safe");
    const inner = safeZoneInnerRect(320, 50, zones[0].inset);
    expect(inner.height).toBeGreaterThanOrEqual(IAB_TAP_TARGET_PX);
    expect(inner.height).toBeCloseTo(IAB_TAP_TARGET_PX, 5);
  });

  it("970×250 billboard: 5% per edge (90% bleed-safe)", () => {
    const zones = displayAdSafeZones(970, 250);
    expect(zones).toHaveLength(1);
    expect(zones[0].label).toMatch(/bleed/i);
    expect(zones[0].inset).toEqual({
      top: GDN_CREATIVE_MARGIN,
      right: GDN_CREATIVE_MARGIN,
      bottom: GDN_CREATIVE_MARGIN,
      left: GDN_CREATIVE_MARGIN,
    });
  });

  it("other IAB units (300×250 MPU) get the GDN 5% clickable-area inset", () => {
    const zones = displayAdSafeZones(300, 250);
    expect(isIabDisplayAdSize(300, 250)).toBe(true);
    expect(zones).toHaveLength(1);
    expect(zones[0].inset.top).toBe(GDN_CREATIVE_MARGIN);
    expect(zones[0].inset.left).toBe(GDN_CREATIVE_MARGIN);
  });

  it("safeZonesForDisplayAdFormat mirrors pixel lookup for catalog rows", () => {
    const mobile = findFormatByDimensions(320, 50);
    expect(safeZonesForDisplayAdFormat(mobile)).toEqual(
      displayAdSafeZones(320, 50),
    );
  });

  it("mobileTapVerticalInset is 0 when the banner is shorter than 44px", () => {
    expect(mobileTapVerticalInset(40)).toBe(0);
    expect(mobileTapVerticalInset(50)).toBeCloseTo((50 - 44) / (2 * 50));
  });
});

describe("SafeZoneOverlay host (#1131)", () => {
  it("falls back to displayAdSafeZones when the catalog has no zones", () => {
    const overlay = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../../components/studio/v2/SafeZoneOverlay.tsx",
      ),
      "utf8",
    );
    expect(overlay).toMatch(/from ["']@\/lib\/ads\/iab-safe-zones["']/);
    expect(overlay).toContain("displayAdSafeZones(canvasWidth, canvasHeight)");
    expect(overlay).toMatch(/catalogZones\.length > 0/);
  });
});
