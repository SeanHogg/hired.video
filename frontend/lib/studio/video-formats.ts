/**
 * Video format catalog — single source of truth for "what aspect ratio
 * + resolution presets does the studio offer?". Used by:
 *   - v1's StudioSettings (its Aspect Ratio + Resolution selects)
 *   - v2's right-panel inspector (Canvas → Format section)
 *   - any future render/export pipeline that needs to map between an id
 *     and concrete (width, height) pixels
 *
 * Per the standing DRY rule: every format-aware surface reads from
 * `VIDEO_FORMATS`. Adding a new preset is one entry here and every
 * picker / migrator / renderer picks it up.
 */

export type AspectRatio =
  | "16:9"
  | "9:16"
  | "1:1"
  | "4:3"
  // Billboard / outdoor-digital ratios. Reachable only via the v2 picker
  // (v1's `findFormatByEnums(aspect, resolution)` pair-store stays on its
  // historical four — v1 is slated for deletion per the deprecation memo).
  | "4:1"
  | "6:1"
  | "1:2";

export type ResolutionTier = "720p" | "1080p" | "4k";

/** A rectangular region of the frame that should remain clear of important
 *  content. Inset values are fractions of canvas width / height (0..1).
 *  Drawn as a dashed outline by [SafeZoneOverlay](../../components/studio/v2/SafeZoneOverlay.tsx)
 *  whenever the active format declares one. */
export interface SafeZone {
  /** Stable kind — drives the overlay's colour + label. */
  kind: "action-safe" | "title-safe" | "platform-ui";
  /** Human-readable label rendered at the top edge of the zone. */
  label: string;
  /** Fractional inset from the canvas edges (0..1 of each side). */
  inset: { top: number; right: number; bottom: number; left: number };
}

export type FormatCategory = "social" | "billboard" | "classic";

export interface VideoFormat {
  /** Stable id — used as the picker's `value`. */
  id: string;
  label: string;
  /** Short description for the picker (destination hint). */
  hint: string;
  width: number;
  height: number;
  aspect: AspectRatio;
  resolution: ResolutionTier;
  /** Picker grouping. Drives the section header order: social → billboard →
   *  classic. Defaults to "social" when omitted. */
  category?: FormatCategory;
  /** Pro-only badge on the picker. 4K + portrait-4K are Pro per v1's
   *  existing gate (StudioSettings labels them with `qualityProSuffix`). */
  proOnly: boolean;
  /** Optional safe-zone overlays — drawn over the authoring canvas so the
   *  user keeps important content out of platform UI chrome (TikTok/Reels
   *  caption band) or away from outdoor-billboard bleed edges. Omit when
   *  the format has no destination-specific safe area. */
  safeZones?: SafeZone[];
}

export const VIDEO_FORMATS: VideoFormat[] = [
  {
    id: "landscape-1080p",
    label: "Landscape 1080p",
    hint: "YouTube / LinkedIn",
    width: 1920,
    height: 1080,
    aspect: "16:9",
    resolution: "1080p",
    proOnly: false,
    // Conservative action-safe 90% — matches the SMPTE / EBU action-safe
    // convention. Useful for the "looks like a TV ad" social-marketing
    // use case so titles don't crowd the frame edge; the formal
    // BS.1770/EBU R128 broadcast pass is roadmap (#845).
    safeZones: [
      {
        kind: "action-safe",
        label: "Action safe (90%)",
        inset: { top: 0.05, right: 0.05, bottom: 0.05, left: 0.05 },
      },
    ],
  },
  {
    id: "landscape-720p",
    label: "Landscape 720p",
    hint: "Fast render",
    width: 1280,
    height: 720,
    aspect: "16:9",
    resolution: "720p",
    proOnly: false,
  },
  {
    id: "landscape-4k",
    label: "Landscape 4K",
    hint: "YouTube — Pro",
    width: 3840,
    height: 2160,
    aspect: "16:9",
    resolution: "4k",
    proOnly: true,
  },
  {
    id: "portrait-1080p",
    label: "Portrait 1080p",
    hint: "TikTok / Reels / Shorts",
    width: 1080,
    height: 1920,
    aspect: "9:16",
    resolution: "1080p",
    proOnly: false,
    // TikTok / Reels / Shorts overlay the bottom ~25% with username +
    // caption + action rail, and the top ~8% with status + back nav.
    // Keep titles + key text inside the inset band.
    safeZones: [
      {
        kind: "platform-ui",
        label: "Platform UI",
        inset: { top: 0.08, right: 0.12, bottom: 0.25, left: 0.04 },
      },
    ],
  },
  {
    id: "portrait-720p",
    label: "Portrait 720p",
    hint: "Fast vertical",
    width: 720,
    height: 1280,
    aspect: "9:16",
    resolution: "720p",
    proOnly: false,
  },
  {
    id: "portrait-4k",
    label: "Portrait 4K",
    hint: "Reels — Pro",
    width: 2160,
    height: 3840,
    aspect: "9:16",
    resolution: "4k",
    proOnly: true,
  },
  {
    id: "square-1080p",
    label: "Square 1080p",
    hint: "Instagram",
    width: 1080,
    height: 1080,
    aspect: "1:1",
    resolution: "1080p",
    proOnly: false,
  },
  {
    id: "square-720p",
    label: "Square 720p",
    hint: "Fast square",
    width: 720,
    height: 720,
    aspect: "1:1",
    resolution: "720p",
    proOnly: false,
  },
  {
    id: "classic-720p",
    label: "Classic 4:3",
    hint: "Slide-deck",
    width: 1024,
    height: 768,
    aspect: "4:3",
    resolution: "720p",
    category: "classic",
    proOnly: false,
  },
  // Outdoor / digital-signage formats. Bleed-safe insets keep the message
  // away from the physical edge of the panel where mounting hardware
  // typically cuts off ~5% on each side. True outdoor-broadcast specs
  // (CEA-708 captioning, Rec.709 gamut clamp, loudness norm) stay roadmap
  // under #845 — these presets just unlock the AUTHORING ratio.
  {
    id: "billboard-wide-1080",
    label: "Billboard 4:1",
    hint: "Roadside · outdoor",
    width: 1920,
    height: 480,
    aspect: "4:1",
    resolution: "1080p",
    category: "billboard",
    proOnly: false,
    safeZones: [
      {
        kind: "action-safe",
        label: "Bleed safe (90%)",
        inset: { top: 0.05, right: 0.05, bottom: 0.05, left: 0.05 },
      },
    ],
  },
  {
    id: "billboard-ultrawide-1080",
    label: "Billboard 6:1",
    hint: "Highway · digital signage",
    width: 1920,
    height: 320,
    aspect: "6:1",
    resolution: "1080p",
    category: "billboard",
    proOnly: false,
    safeZones: [
      {
        kind: "action-safe",
        label: "Bleed safe (90%)",
        inset: { top: 0.05, right: 0.05, bottom: 0.05, left: 0.05 },
      },
    ],
  },
  {
    id: "billboard-tall-1080",
    label: "Kiosk 1:2",
    hint: "Transit · mall portrait",
    width: 540,
    height: 1080,
    aspect: "1:2",
    resolution: "1080p",
    category: "billboard",
    proOnly: false,
    safeZones: [
      {
        kind: "action-safe",
        label: "Bleed safe (90%)",
        inset: { top: 0.05, right: 0.05, bottom: 0.05, left: 0.05 },
      },
    ],
  },
];

/** The four aspect ratios v1's enum-pair store (`aspectRatio` +
 *  `resolution`) understands. Billboards / kiosk formats are v2-only.
 *  Used as a type guard at V1 boundaries while V1 is being retired. */
export type LegacyAspectRatio = "16:9" | "9:16" | "1:1" | "4:3";

export function isLegacyAspectRatio(
  aspect: AspectRatio,
): aspect is LegacyAspectRatio {
  return (
    aspect === "16:9" || aspect === "9:16" || aspect === "1:1" || aspect === "4:3"
  );
}

/** Look up a format by id. Returns null when the id is unknown. */
export function findFormatById(id: string | null | undefined): VideoFormat | null {
  if (!id) return null;
  return VIDEO_FORMATS.find((f) => f.id === id) ?? null;
}

/**
 * Best-match lookup from explicit (width, height). v2 stores raw pixels
 * on CanvasState; this helper lets the picker re-highlight the right
 * preset on reload. Custom dimensions return null.
 */
export function findFormatByDimensions(
  width: number,
  height: number,
): VideoFormat | null {
  return (
    VIDEO_FORMATS.find((f) => f.width === width && f.height === height) ?? null
  );
}

/**
 * v1-style lookup from the enum pair (aspectRatio + resolution). v1's
 * StudioSettings stores those two strings; this helper translates them
 * to a concrete preset so the same picker UI is reused.
 */
export function findFormatByEnums(
  aspect: AspectRatio,
  resolution: ResolutionTier,
): VideoFormat | null {
  return (
    VIDEO_FORMATS.find(
      (f) => f.aspect === aspect && f.resolution === resolution,
    ) ?? null
  );
}

/**
 * Group formats by aspect ratio for picker layout. Order is social
 * (landscape → portrait → square) → classic → billboard (wide → ultra-wide
 * → kiosk) — matches user-frequency priors (most users start landscape,
 * billboards are an explicit minority destination).
 */
export function groupFormatsByAspect(): Array<{
  aspect: AspectRatio;
  label: string;
  formats: VideoFormat[];
}> {
  const order: { aspect: AspectRatio; label: string }[] = [
    { aspect: "16:9", label: "Landscape" },
    { aspect: "9:16", label: "Portrait" },
    { aspect: "1:1", label: "Square" },
    { aspect: "4:3", label: "Classic" },
    { aspect: "4:1", label: "Wide billboard" },
    { aspect: "6:1", label: "Ultra-wide billboard" },
    { aspect: "1:2", label: "Tall kiosk" },
  ];
  return order
    .map(({ aspect, label }) => ({
      aspect,
      label,
      formats: VIDEO_FORMATS.filter((f) => f.aspect === aspect),
    }))
    .filter((group) => group.formats.length > 0);
}
