/**
 * `runtimeStatePayload` — single source of truth for the per-mediaKind
 * slice of the `saveDraft` payload. Closes the studio-audit DRY
 * finding: the editor's `handleSave` used to spread three separate
 * conditional fields (`...isImageKind && imageState ? { imageState } : {}`,
 * `...isAnimationKind && animationState ? { animationState } : {}`,
 * `...gameKind && gameState ? { gameState } : {}`) plus the timeline
 * branch. Adding a new mediaKind (CAD, animated_film, etc.) used to
 * mean editing handleSave; now it's one more case in the switch here.
 *
 * Per the canvas-runtime extensibility model (PRD §1.2), every mediaKind
 * persists exactly ONE runtime-state field — Timeline kinds write
 * `timelineSpec`, non-Timeline kinds each write their own JSONB column
 * (`imageState` / `animationState` / `gameState`). The function emits
 * the right slice + the right `kind: "scene" | "nle"` discriminator
 * for the studio_projects.kind column.
 *
 * Callers spread the result into the saveDraft args; null/undefined
 * snapshot fields produce an empty slice so a non-applicable kind
 * doesn't accidentally write a runtime column that belongs to a
 * different kind.
 */
import type { MediaKind } from "@shared/media-kinds";
import type { CanvasState } from "./canvas-state";
import { canvasStateToTimeline } from "./timeline-emit";
import { mediaKindUsesCanvasStateAuthoring } from "@shared/media-kinds";
import type { ImageState } from "@shared/image-state";
import type { AnimationState } from "@shared/animation-state";
import type { GameState } from "@shared/game-state";

/** Runtime-state snapshot — the editor's live per-kind state at the
 *  moment of save. Each field may be null when the kind isn't active. */
export interface RuntimeSnapshot {
  canvasState: CanvasState;
  imageState: ImageState | null;
  animationState: AnimationState | null;
  gameState: GameState | null;
}

/** Per-mediaKind save-draft payload slice. Keys mirror `studioService.saveDraft`'s
 *  args — callers spread the result into the args object. */
export interface RuntimePayloadSlice {
  /** `kind` storage discriminator on `studio_projects` — Timeline-
   *  authoring kinds use `"nle"`, non-Timeline use `"scene"`. */
  kind: "scene" | "nle";
  timelineSpec?: unknown;
  imageState?: ImageState;
  animationState?: AnimationState;
  gameState?: GameState;
}

/** Build the payload slice for the active mediaKind. The runtime owns
 *  exactly one state column — the slice contains exactly one of
 *  timelineSpec / imageState / animationState / gameState (or none
 *  when the active kind's state isn't ready yet — e.g. game project
 *  hasn't received its initial seed from the chooser pipeline). */
export function runtimeStatePayload(
  mediaKind: MediaKind,
  snapshot: RuntimeSnapshot,
): RuntimePayloadSlice {
  switch (mediaKind) {
    case "image":
      return snapshot.imageState !== null
        ? { kind: "scene", imageState: snapshot.imageState }
        : { kind: "scene" };
    case "animation":
      return snapshot.animationState !== null
        ? { kind: "scene", animationState: snapshot.animationState }
        : { kind: "scene" };
    case "game":
      return snapshot.gameState !== null
        ? { kind: "scene", gameState: snapshot.gameState }
        : { kind: "scene" };
    case "video":
    case "podcast":
    case "voice":
    case "comic":
      // CanvasState-authoring kinds emit the Timeline JSON.
      return {
        kind: "nle",
        timelineSpec: canvasStateToTimeline(snapshot.canvasState),
      };
    default:
      // Exhaustiveness guard — TS errors here if MEDIA_KINDS gains a
      // new entry without a matching branch above. Runtime throw is
      // the safety net for future runtimes that add a mediaKind to
      // MEDIA_KINDS but forget to wire this switch.
      return assertNever(mediaKind, `Unhandled mediaKind in runtimeStatePayload(): ${String(mediaKind)}`);
  }
}

/** Single SoT for "does this kind use the Timeline shell?" — mirrors
 *  `mediaKindUsesCanvasStateAuthoring` from `@shared/media-kinds` so
 *  callers can keep their imports tight without learning the predicate's
 *  full name. Kept as a thin alias rather than reimplementing the
 *  predicate (DRY). */
export function runtimeUsesTimelineEditor(mediaKind: MediaKind): boolean {
  return mediaKindUsesCanvasStateAuthoring(mediaKind);
}

function assertNever(_x: never, msg: string): never {
  throw new Error(msg);
}
