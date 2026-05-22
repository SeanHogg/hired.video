/**
 * Image seeds — per-template `ImageState` factories for `mediaKind: "image"`
 * projects. Parallel to:
 *   - `editor-v2/template-seeds.ts` (Timeline kinds → CanvasState)
 *   - `game/game-seeds.ts` (game kind → GameState)
 *
 * Each call returns a fresh `ImageState` populated with the canvas
 * dimensions the chosen drawing template starts from. Per PRD §1.2
 * canvas-runtime extensibility, every kind owns its own seed registry;
 * `seedTemplate(template)` in `lib/studio/template-dispatch.ts`
 * dispatches to this one for image-kind templates.
 *
 * Per the DRY rule (`feedback_extract_on_duplication`): the actual
 * per-template dimension numbers live in ONE place
 * (`drawing-template-presets.ts`) and are consumed by BOTH this seed
 * registry AND the catalog thumbnail. Adding a new drawing template
 * needs the entry in `DRAWING_TEMPLATE_PRESETS` only — the seed picks
 * it up via `getDrawingTemplatePreset()` and the catalog card renders
 * with the matching aspect automatically.
 */

import {
  createBlankImageState,
  type ImageState,
} from "@shared/image-state";
import { getDrawingTemplatePreset } from "@/lib/studio/drawing/drawing-template-presets";

/** Resolve the seed for an image template. Unknown ids fall back to the
 *  blank-canvas default so a future template id added to the catalog
 *  without a matching preset still produces a usable project. */
export function seedImageFromTemplate(
  templateId: string | null | undefined,
): ImageState {
  const preset = getDrawingTemplatePreset(templateId);
  if (!preset) return createBlankImageState();
  return createBlankImageState(preset.width, preset.height);
}
