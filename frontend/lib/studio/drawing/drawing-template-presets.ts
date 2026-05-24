/**
 * Drawing-template presets — single source of truth for per-template
 * canvas dimensions + visual accent + thumbnail label. Per the DRY rule
 * (`feedback_extract_on_duplication`) every consumer reads from this
 * one record:
 *   • `StudioEditorV2` — seeds a fresh `ImageState` at the right
 *     dimensions when the user opens the editor via a drawing template
 *   • `TemplateThumb` — renders the thumbnail with the matching aspect
 *     + accent colour so the card visually previews the canvas shape
 *     the editor will land on
 *
 * Adding a new drawing template is one entry in `TEMPLATE_CATALOG` +
 * one entry here. The editor seeding + the catalog thumbnail both
 * pick it up automatically.
 */

import type { ContentTemplate } from "@/components/studio/templates/catalog";

export interface DrawingTemplatePreset {
  /** Canvas width in pixels — drives both the seeded ImageState and
   *  the thumbnail aspect ratio. */
  width: number;
  /** Canvas height in pixels. */
  height: number;
  /** Visual accent colour shown on the template card so each preset
   *  reads as distinct at thumbnail size. */
  accent: string;
  /** Human-readable dimension label shown on the card ("1080 · square",
   *  "1200 × 630", etc). */
  dimensionLabel: string;
}

/** Per-template registry. Keys MUST match `ContentTemplate` union
 *  members in `catalog.tsx` — TypeScript enforces the constraint. */
export const DRAWING_TEMPLATE_PRESETS: Partial<
  Record<ContentTemplate, DrawingTemplatePreset>
> = {
  drawing_blank: {
    width: 1024,
    height: 1024,
    accent: "#94a3b8",
    dimensionLabel: "1024 × 1024",
  },
  drawing_social_square: {
    width: 1080,
    height: 1080,
    accent: "#a78bfa",
    dimensionLabel: "1080 · square",
  },
  drawing_og_card: {
    width: 1200,
    height: 630,
    accent: "#34d399",
    dimensionLabel: "1200 × 630",
  },
  // ─── IAB display ad presets (#1041) ──────────────────────────────────
  // Sizes mirror `frontend/lib/studio/video-formats.ts` FormatCategory
  // === "display-ad" entries. ONE source of truth here lets both the
  // image seeder AND the template card thumbnail reflect the official
  // IAB dimension without a parallel table (DRY rule).
  ad_iab_mpu_300x250: {
    width: 300,
    height: 250,
    accent: "#f97316",
    dimensionLabel: "300 × 250 MPU",
  },
  ad_iab_large_rect_336x280: {
    width: 336,
    height: 280,
    accent: "#fb923c",
    dimensionLabel: "336 × 280",
  },
  ad_iab_leaderboard_728x90: {
    width: 728,
    height: 90,
    accent: "#facc15",
    dimensionLabel: "728 × 90 Leaderboard",
  },
  ad_iab_half_page_300x600: {
    width: 300,
    height: 600,
    accent: "#ef4444",
    dimensionLabel: "300 × 600 Half-Page",
  },
  ad_iab_skyscraper_160x600: {
    width: 160,
    height: 600,
    accent: "#dc2626",
    dimensionLabel: "160 × 600 Skyscraper",
  },
  ad_iab_billboard_970x250: {
    width: 970,
    height: 250,
    accent: "#b91c1c",
    dimensionLabel: "970 × 250 Billboard",
  },
  ad_iab_mobile_banner_320x50: {
    width: 320,
    height: 50,
    accent: "#0ea5e9",
    dimensionLabel: "320 × 50 Mobile",
  },
  ad_iab_large_mobile_320x100: {
    width: 320,
    height: 100,
    accent: "#0284c7",
    dimensionLabel: "320 × 100 Large Mobile",
  },
  ad_og_link_card_1200x630: {
    width: 1200,
    height: 630,
    accent: "#10b981",
    dimensionLabel: "1200 × 630 OG card",
  },
};

/** Resolve a drawing preset by template-hint string (may come from the
 *  URL's `?contentTemplate=` param, the chooser, or a slug). Returns
 *  null when the hint isn't a known drawing template — callers fall
 *  back to whatever default is appropriate (StudioEditorV2 uses the
 *  ImageState defaults; the thumb uses a generic preview). */
export function getDrawingTemplatePreset(
  hint: string | null | undefined,
): DrawingTemplatePreset | null {
  if (!hint) return null;
  return (
    DRAWING_TEMPLATE_PRESETS[hint as ContentTemplate] ?? null
  );
}
