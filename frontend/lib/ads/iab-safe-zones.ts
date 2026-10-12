/**
 * IAB display-ad safe-zone insets (#1131).
 *
 * Display-ad templates already default to the right canvas pixels, but
 * the catalog's IAB presets ship with no `safeZones[]`. `SafeZoneOverlay`
 * falls back to `displayAdSafeZones(w, h)` when the catalog returns
 * nothing, so banner authoring still gets GDN / tap-target guides.
 *
 * This module is the IAB/GDN source of truth the overlay consumes:
 *   - 320×50 mobile banner — tap-target ≥44px ≈ 88% of height
 *   - 970×250 IAB billboard — 90% bleed-safe (5% per edge)
 *   - every other IAB unit — GDN 5% creative margin (clickable-area inset)
 *
 * Dimension lookup only *reads* `findFormatByDimensions`; it never
 * edits the catalog. A later studio workstream can copy these arrays
 * onto the IAB `VIDEO_FORMATS` rows.
 *
 * Run: vitest run lib/ads/__tests__/iab-safe-zones.test.ts
 */

import {
  findFormatByDimensions,
  type SafeZone,
  type VideoFormat,
} from "@/lib/studio/video-formats";

/** Apple HIG / IAB mobile tap-target minimum, in CSS pixels. */
export const IAB_TAP_TARGET_PX = 44;

/**
 * GDN / IAB creative margin as a fraction of each canvas edge.
 * Inner area is therefore 90% in both axes ("bleed safe (90%)").
 */
export const GDN_CREATIVE_MARGIN = 0.05;

const GDN_INSET = {
  top: GDN_CREATIVE_MARGIN,
  right: GDN_CREATIVE_MARGIN,
  bottom: GDN_CREATIVE_MARGIN,
  left: GDN_CREATIVE_MARGIN,
} as const;

/** 5% per edge — Google Display Network dynamic-banner compliance. */
export const GDN_MARGIN_ZONE: SafeZone = {
  kind: "action-safe",
  label: "GDN margin (5%)",
  inset: GDN_INSET,
};

/** Same 5% inset, labelled for the 970×250 IAB billboard. */
export const IAB_BILLBOARD_BLEED_ZONE: SafeZone = {
  kind: "action-safe",
  label: "Bleed safe (90%)",
  inset: GDN_INSET,
};

export type DisplayAdSize = Pick<VideoFormat, "id" | "width" | "height" | "category">;

/**
 * Vertical inset (each of top + bottom) that leaves an inner band of
 * `IAB_TAP_TARGET_PX` on a canvas of `height` pixels. 320×50 → 0.06
 * so the tap-target is 44px ≈ 88% of the banner height.
 */
export function mobileTapVerticalInset(height: number): number {
  if (!Number.isFinite(height) || height <= IAB_TAP_TARGET_PX) return 0;
  return (height - IAB_TAP_TARGET_PX) / (2 * height);
}

/** 320×50 (and any equally short IAB mobile strip): 44px tap + 5% clickable sides. */
export function mobileTapZone(width: number, height: number): SafeZone {
  const v = mobileTapVerticalInset(height);
  return {
    kind: "title-safe",
    label: "Tap target (44px)",
    inset: {
      top: v,
      right: GDN_CREATIVE_MARGIN,
      bottom: v,
      left: GDN_CREATIVE_MARGIN,
    },
  };
}

export function isIabDisplayAdFormat(
  format: { category?: string } | null | undefined,
): format is DisplayAdSize {
  return format?.category === "display-ad";
}

export function isIabDisplayAdSize(width: number, height: number): boolean {
  return isIabDisplayAdFormat(findFormatByDimensions(width, height));
}

/**
 * Pixel rectangle the dashed overlay encloses. Used by tests to assert
 * tap-target height without re-deriving the inset math.
 */
export function safeZoneInnerRect(
  width: number,
  height: number,
  inset: SafeZone["inset"],
): { x: number; y: number; width: number; height: number } {
  const left = inset.left * width;
  const top = inset.top * height;
  const right = inset.right * width;
  const bottom = inset.bottom * height;
  return {
    x: left,
    y: top,
    width: width - left - right,
    height: height - top - bottom,
  };
}

function isMobileBanner(format: DisplayAdSize): boolean {
  return format.id === "iab-mobile-banner" || (format.width === 320 && format.height === 50);
}

function isIabBillboard(format: DisplayAdSize): boolean {
  return format.id === "iab-billboard" || (format.width === 970 && format.height === 250);
}

export function safeZonesForDisplayAdFormat(
  format: DisplayAdSize | null | undefined,
): SafeZone[] {
  if (!isIabDisplayAdFormat(format)) return [];
  if (isMobileBanner(format)) return [mobileTapZone(format.width, format.height)];
  if (isIabBillboard(format)) return [IAB_BILLBOARD_BLEED_ZONE];
  return [GDN_MARGIN_ZONE];
}

/** Lookup by canvas pixels — the DrawingStage / overlay seam. */
export function displayAdSafeZones(width: number, height: number): SafeZone[] {
  return safeZonesForDisplayAdFormat(findFormatByDimensions(width, height));
}
