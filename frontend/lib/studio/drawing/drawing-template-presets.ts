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
