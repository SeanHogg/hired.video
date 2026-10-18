/**
 * `runtimeStatePayload` — single source of truth for the per-mediaKind
 * slice of the `saveDraft` payload. Closes the studio-audit DRY
 * finding: the editor's `handleSave` used to spread three separate
 * conditional fields (`...isImageKind && imageState ? { imageState } : {}`,
 * `...isAnimationKind && animationState ? { animationState } : {}`,
 * `...gameKind && gameState ? { gameState } : {}`) plus the timeline
 * branch. Adding a new mediaKind (CAD, animated_film, etc.) used to
 * mean editing handleSave; now it's one more entry in the builder map here.
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
import type { ImageState } from "@shared/image-state";
import type { AnimationState } from "@shared/animation-state";
import type { GameState } from "@shared/game-state";
import type { CadState } from "@shared/cad-state";
import type { Cad3DState } from "@shared/cad-3d-state";
import type { InteractiveComicState } from "@shared/interactive-comic-state";
import type { DocumentState } from "./document-state";
import { stripTabScopedUrls } from "@/lib/studio/media-persistence";

/** Runtime-state snapshot — the editor's live per-kind state at the
 *  moment of save. Each field may be null when the kind isn't active. */
export interface RuntimeSnapshot {
  canvasState: CanvasState;
  imageState: ImageState | null;
  animationState: AnimationState | null;
  gameState: GameState | null;
  cadState: CadState | null;
  cad3dState?: Cad3DState | null;
  interactiveComicState?: InteractiveComicState | null;
  documentState?: DocumentState | null;
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
  cadState?: CadState;
  cad3dState?: Cad3DState;
  interactiveComicState?: InteractiveComicState;
  documentState?: DocumentState;
}

type RuntimeSliceBuilder = (snapshot: RuntimeSnapshot) => RuntimePayloadSlice;

/** CanvasState-authoring kinds emit the Timeline JSON. */
const timelineSlice: RuntimeSliceBuilder = (snapshot) => ({
  kind: "nle",
  timelineSpec: canvasStateToTimeline(snapshot.canvasState),
});

/** Per-kind slice builders. `Record<MediaKind, …>` makes a new MEDIA_KINDS
 *  entry without a builder a compile error. */
const RUNTIME_SLICE_BUILDERS: Record<MediaKind, RuntimeSliceBuilder> = {
  image: (snapshot) =>
    snapshot.imageState !== null
      ? { kind: "scene", imageState: snapshot.imageState }
      : { kind: "scene" },
  animation: (snapshot) =>
    snapshot.animationState !== null
      ? { kind: "scene", animationState: snapshot.animationState }
      : { kind: "scene" },
  game: (snapshot) =>
    snapshot.gameState !== null
      ? { kind: "scene", gameState: snapshot.gameState }
      : { kind: "scene" },
  cad: (snapshot) =>
    snapshot.cadState !== null
      ? { kind: "scene", cadState: snapshot.cadState }
      : { kind: "scene" },
  cad_3d: (snapshot) =>
    snapshot.cad3dState
      ? { kind: "scene", cad3dState: snapshot.cad3dState }
      : { kind: "scene" },
  // Interactive comics carry BOTH the CanvasState (per-page widgets,
  // same as linear comic) AND the branching graph. The Timeline
  // emitter handles the CanvasState half; the branching graph rides
  // alongside in `interactiveComicState`.
  interactive_comic: (snapshot) =>
    snapshot.interactiveComicState
      ? { ...timelineSlice(snapshot), interactiveComicState: snapshot.interactiveComicState }
      : timelineSlice(snapshot),
  video: timelineSlice,
  podcast: timelineSlice,
  voice: timelineSlice,
  comic: timelineSlice,
  // Paged document runtime (#1912) — persists its DocumentState to the
  // `document_state` JSONB column (storage kind "scene", like the other
  // non-Timeline runtimes).
  document: (snapshot) =>
    snapshot.documentState
      ? { kind: "scene", documentState: snapshot.documentState }
      : { kind: "scene" },
};

/** Build the payload slice for the active mediaKind. The runtime owns
 *  exactly one state column — the slice contains exactly one of
 *  timelineSpec / imageState / animationState / gameState (or none
 *  when the active kind's state isn't ready yet — e.g. game project
 *  hasn't received its initial seed from the chooser pipeline). */
export function runtimeStatePayload(
  mediaKind: MediaKind,
  snapshot: RuntimeSnapshot,
): RuntimePayloadSlice {
  const build: RuntimeSliceBuilder | undefined = RUNTIME_SLICE_BUILDERS[mediaKind];
  // Runtime safety net for a kind with no builder (bad persisted data).
  if (!build) {
    throw new Error(`Unhandled mediaKind in runtimeStatePayload(): ${String(mediaKind)}`);
  }
  return build(snapshot);
}

/** The slice a save actually writes: `runtimeStatePayload` with every
 *  tab-scoped `blob:` URL stripped (#563). A blob URL dies with the tab, so
 *  persisting one only stores a broken reference. Used by the editor's one
 *  save path (manual Save and the server autosave alike). */
export function persistableRuntimeSlice(
  mediaKind: MediaKind,
  snapshot: RuntimeSnapshot,
): RuntimePayloadSlice {
  return stripTabScopedUrls(runtimeStatePayload(mediaKind, snapshot));
}
