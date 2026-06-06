/**
 * Template seed dispatch — single entry point for "given a template,
 * give me the seed payload to send to `saveDraft`."
 *
 * Per the PRD §1.2 canvas-runtime extensibility model, every mediaKind
 * has its own state shape and its own seed registry:
 *   - Timeline kinds (video / podcast / voice / animation / comic) →
 *     `CanvasState` via `seedCanvasFromTemplate(id)` in
 *     `editor-v2/template-seeds.ts`
 *   - Game kind → `GameState` via `seedGameFromTemplate(id)` in
 *     `game/game-seeds.ts`
 *   - Image kind → `ImageState` via `seedImageFromTemplate(id)` in
 *     `image/image-seeds.ts`
 *   - Future kinds (cad / xr_scene / 3d_model) add their own seed
 *     registry under `lib/studio/<kind>/<kind>-seeds.ts` and gain a
 *     branch here
 *
 * Per the DRY rule, callers (today: `useCreateStudioDraft`; future:
 * marketplace press-play preview, agent-tool hydrator) call this ONE
 * function and get back a discriminated payload they hand straight to
 * `studioService.saveDraft`. No `if (template.mediaKind === "game")`
 * branches at the call site.
 *
 * The TypeScript exhaustiveness check (`assertNever` on the switch
 * default) is load-bearing — adding a new mediaKind to MEDIA_KINDS
 * without a matching branch here is a compile error, which prevented
 * the "select image template → crash with 'Cannot read properties of
 * undefined (reading name)'" bug from sneaking past a future kind add.
 */

import type { TemplateDef } from "@/components/studio/templates/catalog";
import { seedCanvasFromTemplate } from "./editor-v2/template-seeds";
import { canvasStateToTimeline } from "./editor-v2/timeline-emit";
import { seedGameFromTemplate } from "./game/game-seeds";
import { seedImageFromTemplate } from "./image/image-seeds";
import { seedAnimationFromTemplate } from "./animation/animation-seeds";
import { seedCadFromTemplate } from "./cad/cad-seeds";
import { type CadState } from "@shared/cad-state";
import type { GameState } from "@shared/game-state";
import type { ImageState } from "@shared/image-state";
import type { AnimationState } from "@shared/animation-state";
import { createBlankCad3DState } from "@shared/cad-3d-state";
import { createBlankInteractiveComicState } from "@shared/interactive-comic-state";
import {
  type DocumentState,
  type DocumentEntityKind,
  createBlankDocumentState,
} from "./editor-v2/document-state";
import { newId } from "./editor-v2/document-edit";

/** Discriminated payload — exactly ONE state-shaped field is set per
 *  result; the shape mirrors what `saveDraft` accepts on the wire.
 *  Future kinds add new optional fields here. */
export interface TemplateSeedPayload {
  /** Display name pulled from `template.defaultName` so the chooser
   *  doesn't have to read it separately. */
  name: string;
  /** Timeline JSON for Timeline-runtime kinds (video / podcast / voice /
   *  animation / comic). Undefined for non-Timeline kinds. */
  timelineSpec?: unknown;
  /** Game state JSON for `mediaKind: "game"`. Undefined for other kinds. */
  gameState?: GameState;
  /** Image state JSON for `mediaKind: "image"`. Undefined for other kinds. */
  imageState?: ImageState;
  /** Animation state JSON for `mediaKind: "animation"` (#1003). Undefined
   *  for other kinds. */
  animationState?: AnimationState;
  /** CAD state JSON for `mediaKind: "cad"` (#930). Undefined for
   *  other kinds. */
  cadState?: CadState;
  /** 3D CAD state JSON for `mediaKind: "cad_3d"` (#930 follow-on). */
  cad3dState?: import("@shared/cad-3d-state").Cad3DState;
  /** Interactive comic branching graph for `mediaKind: "interactive_comic"` (#929). */
  interactiveComicState?: import("@shared/interactive-comic-state").InteractiveComicState;
  /** Document state for `mediaKind: "document"` (#1912) — resume / job /
   *  article / blog paged WYSIWYG canvas. */
  documentState?: DocumentState;
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
    case "image":
      return { name, imageState: seedImageFromTemplate(template.id) };
    case "animation":
      // Animation mediaKind (#1003) mounts the frame-by-frame
      // <AnimationStage> runtime; its seed registry lives in
      // `animation/animation-seeds.ts`. No timelineSpec emitted —
      // export goes through the GIF/APNG/WebP encoder strategies.
      return { name, animationState: seedAnimationFromTemplate(template.id) };
    case "cad":
      // CAD mediaKind (#930) — 2D vector drafting. No template seed
      // registry yet; every CAD project lands as a blank drawing.
      return { name, cadState: seedCadFromTemplate(template.id) };
    case "cad_3d": {
      // 3D CAD runtime stub (#930 follow-on). Blank scene; the editor's
      // primitive palette is the entry path.
      return { name, cad3dState: createBlankCad3DState() };
    }
    case "interactive_comic": {
      // Interactive comic (#929) — branching graph. Ride the existing
      // linear-comic canvas seed for the pages, and seed a blank branch
      // graph on top.
      return {
        name,
        timelineSpec: canvasStateToTimeline(seedCanvasFromTemplate(template.id)),
        interactiveComicState: createBlankInteractiveComicState(),
      };
    }
    case "video":
    case "podcast":
    case "voice":
    case "comic":
      // Timeline-runtime kinds (and comic which authors via CanvasState
      // today per the user's enum addition) share the same canvas seed
      // registry. Animation was MOVED OUT of this branch in #1003 —
      // animation now has its own canvas runtime.
      return {
        name,
        timelineSpec: canvasStateToTimeline(seedCanvasFromTemplate(template.id)),
      };
    case "document": {
      // Document runtime (#1912) — seed a blank DocumentState. The entity
      // axis (resume / job / article / blog) defaults to resume until the
      // catalog carries a per-template `documentEntityKind` (#1917); the
      // template id will select it then.
      const entityKind: DocumentEntityKind = "resume";
      return {
        name,
        documentState: createBlankDocumentState(entityKind, () => newId("page")),
      };
    }
    default:
      // Exhaustiveness guard — TS errors here if a new MediaKind is
      // added to `MEDIA_KINDS` without a matching branch above. Runtime
      // throw is the safety net: a future "scene" / "3d_model" added by
      // someone in a hurry would otherwise return `undefined`, crash at
      // `seed.name`, and surface as the same opaque toast that prompted
      // the image-kind fix.
      return assertNever(template.mediaKind, `Unhandled mediaKind in seedTemplate(): ${String(template.mediaKind)}`);
  }
}

function assertNever(_x: never, msg: string): never {
  throw new Error(msg);
}
