/**
 * Template seed dispatch — single entry point for "given a template,
 * give me the seed payload to send to `saveDraft`."
 *
 * Per the PRD §1.2 canvas-runtime extensibility model, every mediaKind
 * has its own state shape and its own seed registry:
 *   - Timeline kinds (video / podcast / voice / animation) → `CanvasState`
 *     via `seedCanvasFromTemplate(id)` in `editor-v2/template-seeds.ts`
 *   - Game kind → `GameState` via `seedGameFromTemplate(id)` in
 *     `game/game-seeds.ts`
 *   - Future kinds (image / cad / comic) add their own seed registry
 *     under `lib/studio/<kind>/<kind>-seeds.ts` and gain a branch here
 *
 * Per the DRY rule, callers (today: `useCreateStudioDraft`; future:
 * marketplace press-play preview, agent-tool hydrator) call this ONE
 * function and get back a discriminated payload they hand straight to
 * `studioService.saveDraft`. No `if (template.mediaKind === "game")`
 * branches at the call site.
 */

import type { TemplateDef } from "@/components/studio/templates/catalog";
import { seedCanvasFromTemplate } from "./editor-v2/template-seeds";
import { canvasStateToTimeline } from "./editor-v2/timeline-emit";
import { seedGameFromTemplate } from "./game/game-seeds";
import type { GameState } from "@shared/game-state";

/** Discriminated payload — exactly ONE field is set per result; the
 *  shape mirrors what `saveDraft` accepts on the wire. Future kinds
 *  add new optional fields here. */
export interface TemplateSeedPayload {
  /** Display name pulled from `template.defaultName` so the chooser
   *  doesn't have to read it separately. */
  name: string;
  /** Timeline JSON for Timeline-runtime kinds (video / podcast / voice /
   *  animation). Undefined for non-Timeline kinds. */
  timelineSpec?: unknown;
  /** Game state JSON for `mediaKind: "game"`. Undefined for other kinds. */
  gameState?: GameState;
  // Future: imageState?, cadState?, comicState?, …
}

/**
 * Resolve the seed payload for a template. Dispatches by mediaKind into
 * the per-kind seed registry, then packages the result in the shape
 * `saveDraft` accepts on the wire.
 */
export function seedTemplate(template: TemplateDef): TemplateSeedPayload {
  const name = template.defaultName;
  switch (template.mediaKind) {
    case "game":
      return { name, gameState: seedGameFromTemplate(template.id) };
    case "video":
    case "podcast":
    case "voice":
    case "animation":
    case "comic":
      // All Timeline-runtime kinds (and comic which authors via
      // CanvasState today per the user's enum addition) share the same
      // canvas seed registry.
      return {
        name,
        timelineSpec: canvasStateToTimeline(seedCanvasFromTemplate(template.id)),
      };
  }
}
