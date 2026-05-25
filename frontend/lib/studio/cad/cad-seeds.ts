/**
 * CAD template seeds — per-template `CadState` factories (#930).
 * Parallel to `animation-seeds.ts` / `image-seeds.ts`: each template
 * in the catalog has its own preset (sheet size + unit + grid). Per
 * the DRY rule the sheet dimensions live in ONE place — both the
 * `<TemplateThumb>` card AND the seed read from this table.
 *
 * Sheet sizes follow ISO 216 (A0-A4) which both architectural and
 * mechanical drafters use. Unit defaults to mm; grid spacing matches
 * the typical scale-of-work (5mm for part drawings, 100mm for floor
 * plans, 250mm for blueprints, 2.54mm for electrical schematics — the
 * 0.1-inch pitch standard ICs are laid out on).
 */

import {
  createBlankCadState,
  DEFAULT_GRID_SETTINGS,
  type CadState,
  type CadGridSettings,
} from "@shared/cad-state";

interface CadTemplatePreset {
  widthMm: number;
  heightMm: number;
  unit: CadState["unit"];
  grid: CadGridSettings;
}

const CAD_TEMPLATE_PRESETS: Record<string, CadTemplatePreset> = {
  // A2 landscape — 594×420mm. 1:50 architectural scale. Grid at 100mm
  // (= 5m on-page) anchors walls + door openings.
  "cad-floor-plan": {
    widthMm: 594,
    heightMm: 420,
    unit: "mm",
    grid: { ...DEFAULT_GRID_SETTINGS, visibleSpacingMm: 100, snapSpacingMm: 10 },
  },
  // A3 landscape — 420×297mm. 1:1 scale (drawing IS the part).
  // Grid at 5mm for fine mechanical detail.
  "cad-part-drawing": {
    widthMm: 420,
    heightMm: 297,
    unit: "mm",
    grid: { ...DEFAULT_GRID_SETTINGS, visibleSpacingMm: 5, snapSpacingMm: 1 },
  },
  // A3 landscape — electrical schematics use 0.1" (2.54mm) IC pitch
  // as the canonical grid so resistors / pin numbers / breadboard
  // holes all snap correctly.
  "cad-electrical-schematic": {
    widthMm: 420,
    heightMm: 297,
    unit: "mm",
    grid: { ...DEFAULT_GRID_SETTINGS, visibleSpacingMm: 2.54, snapSpacingMm: 2.54 },
  },
  // A1 landscape — 841×594mm. 1:100 scale for large-format buildings.
  // Grid at 250mm = 25m on-page.
  "cad-blueprint": {
    widthMm: 841,
    heightMm: 594,
    unit: "mm",
    grid: { ...DEFAULT_GRID_SETTINGS, visibleSpacingMm: 250, snapSpacingMm: 50 },
  },
};

/** Resolve the seed for a CAD template. Unknown ids fall back to the
 *  default A3 blank canvas so a future template id added to the
 *  catalog without a matching preset still produces a usable project
 *  (per the same fallback pattern as `seedImageFromTemplate`). */
export function seedCadFromTemplate(templateId: string | null | undefined): CadState {
  const preset = templateId ? CAD_TEMPLATE_PRESETS[templateId] : undefined;
  if (!preset) return createBlankCadState();
  const state = createBlankCadState({
    widthMm: preset.widthMm,
    heightMm: preset.heightMm,
    unit: preset.unit,
  });
  return { ...state, grid: preset.grid };
}

/** Exported for the TemplateThumb so the card preview reads the same
 *  sheet dimensions as the seed (DRY single source). */
export function getCadTemplatePreset(
  templateId: string | null | undefined,
): CadTemplatePreset | null {
  if (!templateId) return null;
  return CAD_TEMPLATE_PRESETS[templateId] ?? null;
}
