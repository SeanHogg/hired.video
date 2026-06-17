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
  | "1:2"
  // Social-ad + share-card ratios. 4:5 = Meta In-Feed portrait video
  // (1080×1350); 1.91:1 = Open Graph / Facebook + LinkedIn link-share
  // card (1200×630); 2:3 = Pinterest Pin (1000×1500).
  | "4:5"
  | "1.91:1"
  | "2:3"
  // IAB display-ad ratios. These cluster under the "Display ad" group
  // via `groupFormatsByCategory()` and are NOT surfaced in the social
  // aspect grid — the user picks them from the ad picker by named size.
  // 6:5 covers MPU (300×250) + large rectangle (336×280) + square
  // (250×250) + rectangle (180×150). 8:1 ≈ leaderboard (728×90). 4:15
  // ≈ wide skyscraper (160×600). 32:5 = mobile banner (320×50). 16:5 =
  // large mobile banner (320×100). 19.4:5 = IAB billboard (970×250) —
  // close enough to call "wide rectangle" without inventing a custom
  // enum for one preset.
  | "6:5"
  | "8:1"
  | "4:15"
  | "32:5"
  | "16:5"
  | "19.4:5";

export type ResolutionTier = "720p" | "1080p" | "4k";

/** Distribution-channel bucket used by the ad-context picker. Lets the
 *  same VideoFormat catalog drive the existing aspect-grouped social
 *  picker AND a new channel-grouped picker for ad campaigns without
 *  forking the registry. Per the standing DRY rule: ONE catalog, two
 *  group helpers, both filter the same rows.
 *
 *  Adding a new channel is one new value here + one entry in
 *  `FORMAT_CATEGORY_ORDER` below; the ad picker picks it up. */
export type FormatCategory =
  | "social-feed"      // Square / landscape feed posts — IG, FB, LinkedIn
  | "social-story"     // Vertical full-screen — Reels, Stories, TikTok, Shorts
  | "broadcast"        // YouTube long-form, OTT / CTV pre-roll, in-stream
  | "display-ad"       // IAB-standard display banners (web placement)
  | "outdoor"          // Billboards + digital signage + kiosks
  | "share-card";      // OG / link-share preview cards

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
  /** Distribution-channel bucket — drives `groupFormatsByCategory()` and
   *  per-channel picker UIs (ad-campaign creative size selector, the
   *  `/studio` chooser's "Channel" filter row). Defaults to `social-feed`
   *  on every legacy entry so pre-existing code paths see the same set. */
  category: FormatCategory;
  /** Pro-only badge on the picker. 4K + portrait-4K are Pro per v1's
   *  existing gate (StudioSettings labels them with `qualityProSuffix`). */
  proOnly: boolean;
  /** Optional safe-zone overlays — drawn over the authoring canvas so the
   *  user keeps important content out of platform UI chrome (TikTok/Reels
   *  caption band) or away from outdoor-billboard bleed edges. Omit when
   *  the format has no destination-specific safe area. */
  safeZones?: SafeZone[];
}

/** Shared 5% action / bleed safe inset — used by landscape-1080p (SMPTE
 *  action-safe convention) and every billboard format (mounting bleed).
 *  One declaration so a future tweak ("tighten to 7%?") changes every
 *  consumer in one edit. */
const BLEED_SAFE_INSET = {
  top: 0.05,
  right: 0.05,
  bottom: 0.05,
  left: 0.05,
} as const;

const BLEED_SAFE_ZONE: SafeZone = {
  kind: "action-safe",
  label: "Bleed safe (90%)",
  inset: BLEED_SAFE_INSET,
};

/** TikTok / Reels / Shorts chrome band — the same zone portrait-1080p
 *  hand-declares, lifted out so every 9:16 preset (720p, 4K) inherits it
 *  via the aspect table below (#856). */
const PORTRAIT_PLATFORM_UI_ZONE: SafeZone = {
  kind: "platform-ui",
  label: "Platform UI",
  inset: { top: 0.08, right: 0.12, bottom: 0.25, left: 0.04 },
};

/** Default safe zones derived from aspect ratio (#856). Previously only
 *  landscape-1080p + portrait-1080p hand-declared `safeZones`, so 720p /
 *  4K / square presets showed no guides at all. This table gives every
 *  preset of a given shape the same guides as its 1080p sibling. A
 *  format's own explicit `safeZones` still takes precedence (e.g.
 *  billboards keep their bleed-only zone). */
const SAFE_ZONES_BY_ASPECT: Partial<Record<AspectRatio, SafeZone[]>> = {
  "16:9": [{ ...BLEED_SAFE_ZONE, label: "Action safe (90%)" }],
  "9:16": [PORTRAIT_PLATFORM_UI_ZONE],
  "1:1": [{ ...BLEED_SAFE_ZONE, label: "Action safe (90%)" }],
  "4:3": [{ ...BLEED_SAFE_ZONE, label: "Action safe (90%)" }],
};

/**
 * Resolve the safe zones to draw for a format: an explicit per-format
 * declaration wins, otherwise fall back to the aspect-derived default.
 * Single seam so the overlay and any future consumer agree (#856).
 */
export function safeZonesForFormat(
  format: VideoFormat | null | undefined,
): SafeZone[] {
  if (!format) return [];
  if (format.safeZones && format.safeZones.length > 0) return format.safeZones;
  return SAFE_ZONES_BY_ASPECT[format.aspect] ?? [];
}

export const VIDEO_FORMATS: VideoFormat[] = [
  {
    id: "landscape-1080p",
    label: "Landscape 1080p",
    hint: "YouTube / LinkedIn / CTV",
    width: 1920,
    height: 1080,
    aspect: "16:9",
    resolution: "1080p",
    category: "broadcast",
    proOnly: false,
    // Conservative action-safe 90% — matches the SMPTE / EBU action-safe
    // convention. Useful for the "looks like a TV ad" social-marketing
    // use case so titles don't crowd the frame edge; the formal
    // BS.1770/EBU R128 broadcast pass is roadmap (#845).
    safeZones: [{ ...BLEED_SAFE_ZONE, label: "Action safe (90%)" }],
  },
  {
    id: "landscape-720p",
    label: "Landscape 720p",
    hint: "Fast render",
    width: 1280,
    height: 720,
    aspect: "16:9",
    resolution: "720p",
    category: "broadcast",
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
    category: "broadcast",
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
    category: "social-story",
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
    category: "social-story",
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
    category: "social-story",
    proOnly: true,
  },
  {
    id: "square-1080p",
    label: "Square 1080p",
    hint: "Instagram / LinkedIn feed",
    width: 1080,
    height: 1080,
    aspect: "1:1",
    resolution: "1080p",
    category: "social-feed",
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
    category: "social-feed",
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
    category: "broadcast",
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
    category: "outdoor",
    proOnly: false,
    safeZones: [BLEED_SAFE_ZONE],
  },
  {
    id: "billboard-ultrawide-1080",
    label: "Billboard 6:1",
    hint: "Highway · digital signage",
    width: 1920,
    height: 320,
    aspect: "6:1",
    resolution: "1080p",
    category: "outdoor",
    proOnly: false,
    safeZones: [BLEED_SAFE_ZONE],
  },
  {
    id: "billboard-tall-1080",
    label: "Kiosk 1:2",
    hint: "Transit · mall portrait",
    width: 540,
    height: 1080,
    aspect: "1:2",
    resolution: "1080p",
    category: "outdoor",
    proOnly: false,
    safeZones: [BLEED_SAFE_ZONE],
  },
  // ─── Social-ad presets ─────────────────────────────────────────────────────
  // Channel-specific feed + share-card sizes the 2026 Meta / LinkedIn /
  // Pinterest ad managers expect. The campaign-creative picker filters
  // VIDEO_FORMATS by category="social-feed" / "share-card" so adding a
  // new size here flows straight through to every ad surface (DRY).
  {
    id: "social-meta-feed-4x5",
    label: "Meta In-Feed 4:5",
    hint: "Facebook / Instagram feed video — Meta's 2026 gold standard",
    width: 1080,
    height: 1350,
    aspect: "4:5",
    resolution: "1080p",
    category: "social-feed",
    proOnly: false,
  },
  {
    id: "social-pinterest-2x3",
    label: "Pinterest Pin 2:3",
    hint: "Pinterest Standard Pin · Idea Pin first frame",
    width: 1000,
    height: 1500,
    aspect: "2:3",
    resolution: "1080p",
    category: "social-feed",
    proOnly: false,
  },
  {
    id: "share-card-og-1.91x1",
    label: "Open Graph 1.91:1",
    hint: "LinkedIn / Facebook / X link-share card",
    width: 1200,
    height: 630,
    aspect: "1.91:1",
    resolution: "1080p",
    category: "share-card",
    proOnly: false,
  },
  // ─── IAB display-ad presets ────────────────────────────────────────────────
  // The eight units that cover ~80% of programmatic + Google Display
  // Network inventory in 2026. Single mediaKind="image" template per
  // size lets non-designers ship a banner without leaving the studio.
  // The full IAB New Ad Portfolio is roadmap (#1042) — start with the
  // sizes that actually trade.
  {
    id: "iab-medium-rectangle",
    label: "IAB Medium Rectangle 300×250",
    hint: "MPU · sidebar + in-article · most-bought IAB unit",
    width: 300,
    height: 250,
    aspect: "6:5",
    resolution: "720p",
    category: "display-ad",
    proOnly: false,
  },
  {
    id: "iab-large-rectangle",
    label: "IAB Large Rectangle 336×280",
    hint: "In-article · Google Display Network common",
    width: 336,
    height: 280,
    aspect: "6:5",
    resolution: "720p",
    category: "display-ad",
    proOnly: false,
  },
  {
    id: "iab-leaderboard",
    label: "IAB Leaderboard 728×90",
    hint: "Top-of-page horizontal banner",
    width: 728,
    height: 90,
    aspect: "8:1",
    resolution: "720p",
    category: "display-ad",
    proOnly: false,
  },
  {
    id: "iab-half-page",
    label: "IAB Half-Page 300×600",
    hint: "Tall sidebar — high-impact desktop unit",
    width: 300,
    height: 600,
    aspect: "1:2",
    resolution: "720p",
    category: "display-ad",
    proOnly: false,
  },
  {
    id: "iab-wide-skyscraper",
    label: "IAB Wide Skyscraper 160×600",
    hint: "Side-rail vertical · classic banner",
    width: 160,
    height: 600,
    aspect: "4:15",
    resolution: "720p",
    category: "display-ad",
    proOnly: false,
  },
  {
    id: "iab-billboard",
    label: "IAB Billboard 970×250",
    hint: "Top-of-page hero · premium publisher inventory",
    width: 970,
    height: 250,
    aspect: "19.4:5",
    resolution: "720p",
    category: "display-ad",
    proOnly: false,
  },
  {
    id: "iab-mobile-banner",
    label: "IAB Mobile Banner 320×50",
    hint: "Sticky bottom · mobile web",
    width: 320,
    height: 50,
    aspect: "32:5",
    resolution: "720p",
    category: "display-ad",
    proOnly: false,
  },
  {
    id: "iab-large-mobile-banner",
    label: "IAB Large Mobile 320×100",
    hint: "Mobile in-feed · 2× taller than the sticky",
    width: 320,
    height: 100,
    aspect: "16:5",
    resolution: "720p",
    category: "display-ad",
    proOnly: false,
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
 * (landscape → portrait → square + social-portrait + pinterest) → classic
 * → billboard (wide → ultra-wide → kiosk) → share-card → display-ad
 * one-offs.
 *
 * Display-ad ratios sit at the END so the existing pickers (which mostly
 * surface the social grid) don't get cluttered. New ad-context surfaces
 * should call `groupFormatsByCategory()` instead — the catalog stays
 * single-sourced, the layout changes.
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
    { aspect: "4:5", label: "Meta In-Feed" },
    { aspect: "2:3", label: "Pinterest Pin" },
    { aspect: "4:3", label: "Classic" },
    { aspect: "1.91:1", label: "Link-share card" },
    { aspect: "4:1", label: "Wide billboard" },
    { aspect: "6:1", label: "Ultra-wide billboard" },
    { aspect: "1:2", label: "Tall kiosk + Half-Page" },
    { aspect: "6:5", label: "IAB Medium Rectangle" },
    { aspect: "8:1", label: "IAB Leaderboard" },
    { aspect: "4:15", label: "IAB Skyscraper" },
    { aspect: "32:5", label: "IAB Mobile Banner" },
    { aspect: "16:5", label: "IAB Large Mobile" },
    { aspect: "19.4:5", label: "IAB Billboard" },
  ];
  return order
    .map(({ aspect, label }) => ({
      aspect,
      label,
      formats: VIDEO_FORMATS.filter((f) => f.aspect === aspect),
    }))
    .filter((group) => group.formats.length > 0);
}

/** Distribution-channel grouping for ad-context pickers (campaign
 *  creative size selector, the `/studio` chooser's channel filter). One
 *  registry → two group helpers, each free to lay out the same formats
 *  differently per the standing DRY rule. */
const FORMAT_CATEGORY_ORDER: { id: FormatCategory; label: string }[] = [
  { id: "social-feed",  label: "Social feed (IG / FB / LinkedIn)" },
  { id: "social-story", label: "Stories + Reels (TikTok / IG / Shorts)" },
  { id: "broadcast",    label: "YouTube + Connected TV" },
  { id: "display-ad",   label: "Display ads (IAB standards)" },
  { id: "outdoor",      label: "Outdoor + digital signage" },
  { id: "share-card",   label: "Link-share card" },
];

export function groupFormatsByCategory(): Array<{
  category: FormatCategory;
  label: string;
  formats: VideoFormat[];
}> {
  return FORMAT_CATEGORY_ORDER
    .map(({ id, label }) => ({
      category: id,
      label,
      formats: VIDEO_FORMATS.filter((f) => f.category === id),
    }))
    .filter((group) => group.formats.length > 0);
}

/** Per-category UI metadata — drives the channel filter pills + ad
 *  picker section headers. Centralised so the icon + blurb stays in
 *  lockstep across every consumer (DRY). */
export const FORMAT_CATEGORY_UI: Record<
  FormatCategory,
  { label: string; blurb: string }
> = {
  "social-feed":  { label: "Social feed",   blurb: "Square + 4:5 feed posts for IG, FB, LinkedIn." },
  "social-story": { label: "Stories",       blurb: "Vertical full-screen for Reels, Stories, TikTok, Shorts." },
  "broadcast":    { label: "Broadcast",     blurb: "16:9 for YouTube, OTT / CTV pre-roll, in-stream." },
  "display-ad":   { label: "Display ad",    blurb: "IAB-standard web banners. 300×250, 728×90, and the rest of the top eight." },
  "outdoor":      { label: "Outdoor",       blurb: "Billboards, transit kiosks, digital signage." },
  "share-card":   { label: "Link-share",    blurb: "1200×630 Open Graph card for LinkedIn / FB / X." },
};
