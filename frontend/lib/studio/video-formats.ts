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

export type AspectRatio = "16:9" | "9:16" | "1:1" | "4:3";
export type ResolutionTier = "720p" | "1080p" | "4k";

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
  /** Pro-only badge on the picker. 4K + portrait-4K are Pro per v1's
   *  existing gate (StudioSettings labels them with `qualityProSuffix`). */
  proOnly: boolean;
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
    proOnly: false,
  },
];

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
 * Group formats by aspect ratio for picker layout. Order is
 * landscape → portrait → square → classic — matches user-frequency
 * priors (most users start with landscape).
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
  ];
  return order.map(({ aspect, label }) => ({
    aspect,
    label,
    formats: VIDEO_FORMATS.filter((f) => f.aspect === aspect),
  }));
}
