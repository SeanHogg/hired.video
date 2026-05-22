/**
 * Image seeds — per-template `ImageState` factories for `mediaKind: "image"`
 * projects. Parallel to:
 *   - `editor-v2/template-seeds.ts` (Timeline kinds → CanvasState)
 *   - `game/game-seeds.ts` (game kind → GameState)
 *
 * Each entry returns a fresh `ImageState` populated with the canvas
 * dimensions + background the chosen drawing template starts from. Per
 * PRD §1.2 canvas-runtime extensibility, every kind owns its own seed
 * registry; `seedTemplate(template)` in `lib/studio/template-dispatch.ts`
 * dispatches to this one for image-kind templates.
 *
 * Phase 1 ships dimension presets only — `drawing_blank` (1024×1024),
 * `drawing_social_square` (1080×1080), `drawing_og_card` (1200×630). The
 * shared `createBlankImageState()` helper in `@shared/image-state` builds
 * the actual state shape (one empty raster layer + a white background)
 * so the catalog only declares the preset axis it cares about.
 */

import {
  createBlankImageState,
  type ImageState,
} from "@shared/image-state";
import type { ContentTemplate } from "@/components/studio/templates/catalog";

/** Resolve the seed for an image template. Unknown ids fall back to the
 *  blank-canvas default so a future template id added to the catalog
 *  without a matching seed still produces a usable project. */
export function seedImageFromTemplate(
  templateId: string | null | undefined,
): ImageState {
  if (!templateId) return createBlankImageState();
  const seed = IMAGE_SEEDS[templateId as ContentTemplate];
  if (!seed) return createBlankImageState();
  return seed();
}

// Per-template dimension presets. The `desc` field in the catalog
// documents the same numbers in human form — the SoT for the actual
// canvas dimensions lives HERE (and feeds the editor) rather than being
// parsed out of marketing copy.
const IMAGE_SEEDS: Partial<Record<ContentTemplate, () => ImageState>> = {
  drawing_blank: () => createBlankImageState(1024, 1024),
  drawing_social_square: () => createBlankImageState(1080, 1080),
  drawing_og_card: () => createBlankImageState(1200, 630),
};
