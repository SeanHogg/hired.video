/**
 * The per-format runtime descriptor — ONE place for every per-kind rule the
 * studio editor's modules apply to a format's runtime state: which runtime a
 * media kind authors on, its tool family, when it has hydrated / may be
 * persisted, whether it has an inspector, its collaborative snapshot, its
 * local-draft slice and its content predicate. Pure functions over plain
 * data; the hooks (readiness, local draft, collab, hydration) and the header
 * READ this, and the surface registry (components/studio/v2/surfaces) is
 * keyed by the same `StudioRuntimeKey` / `StudioToolFamily`, so adding a
 * format is one entry here plus one surface entry there.
 */
import type { Dispatch, SetStateAction } from "react";
import { documentHasInspector } from "@/lib/studio/document/document-inspectors";
import type { MediaKind } from "@shared/media-kinds";
import type { ImageState } from "@shared/image-state";
import type { AnimationState } from "@shared/animation-state";
import type { GameState } from "@shared/game-state";
import type { CadState } from "@shared/cad-state";
import type { Cad3DState } from "@shared/cad-3d-state";
import type { InteractiveComicState } from "@shared/interactive-comic-state";
import type { StudioToolFamily } from "@/lib/workspace/studio-tool-slots";
import type { CanvasState } from "./canvas-state";
import type { DocumentEntityContent, DocumentState } from "./document-state";
import type { StudioRuntimes } from "./use-history-runtimes";

/** The canvas runtime a media kind authors on. Every kind without its own
 *  self-hosted runtime authors on the Timeline's CanvasState. */
export type StudioRuntimeKey =
  | "timeline"
  | "image"
  | "animation"
  | "game"
  | "cad"
  | "cad_3d"
  | "interactive_comic"
  | "document";

/** Each runtime's tool family (the surface registry's left tabs / inspector /
 *  Preview / strip). Comic+ authors its pages on the Timeline shell, so it
 *  shares the Timeline family while mounting its own canvas. */
export const RUNTIME_FAMILY = {
  timeline: "timeline",
  interactive_comic: "timeline",
  image: "image",
  animation: "animation",
  game: "game",
  document: "document",
  cad: "other",
  cad_3d: "other",
} as const satisfies Record<StudioRuntimeKey, StudioToolFamily>;

export function runtimeKeyFor(kind: MediaKind): StudioRuntimeKey {
  switch (kind) {
    case "image":
    case "animation":
    case "game":
    case "cad":
    case "cad_3d":
    case "interactive_comic":
    case "document":
      return kind;
    default:
      return "timeline";
  }
}

/** The editor's live state across every runtime — plain data, no handlers. */
export interface StudioStateSnapshot {
  canvasState: CanvasState;
  imageState: ImageState;
  animationState: AnimationState;
  gameState: GameState | null;
  cadState: CadState;
  cad3dState: Cad3DState;
  interactiveComicState: InteractiveComicState;
  documentState: DocumentState;
  /** A document's bound entity CONTENT (résumé / job / article). */
  documentEntityContent: DocumentEntityContent | null;
}

export function studioStateSnapshot(canvasState: CanvasState, runtimes: StudioRuntimes): StudioStateSnapshot {
  return {
    canvasState,
    imageState: runtimes.image.imageState,
    animationState: runtimes.animation.animationState,
    gameState: runtimes.game.gameState,
    cadState: runtimes.cad.cadState,
    cad3dState: runtimes.cad3d.cad3DState,
    interactiveComicState: runtimes.interactiveComic.interactiveComicState,
    documentState: runtimes.document.documentState,
    documentEntityContent: runtimes.document.documentEntityContent,
  };
}

/** The setters a peer's collaborative snapshot is written through. */
export interface StudioStateWriters {
  setCanvasState: Dispatch<SetStateAction<CanvasState>>;
  setImageState: Dispatch<SetStateAction<ImageState>>;
  setAnimationState: Dispatch<SetStateAction<AnimationState>>;
  setGameState: Dispatch<SetStateAction<GameState | null>>;
  setCadState: Dispatch<SetStateAction<CadState>>;
  setCad3DState: Dispatch<SetStateAction<Cad3DState>>;
  setInteractiveComicState: Dispatch<SetStateAction<InteractiveComicState>>;
  setDocumentState: Dispatch<SetStateAction<DocumentState>>;
  setDocumentEntityContent: Dispatch<SetStateAction<DocumentEntityContent | null>>;
}

/** The writers over the live Timeline canvas and every runtime. */
export function studioStateWriters(
  setCanvasState: Dispatch<SetStateAction<CanvasState>>,
  runtimes: StudioRuntimes,
): StudioStateWriters {
  return {
    setCanvasState,
    setImageState: runtimes.image.setImageState,
    setAnimationState: runtimes.animation.setAnimationState,
    setGameState: runtimes.game.setGameState,
    setCadState: runtimes.cad.setCadState,
    setCad3DState: runtimes.cad3d.setCad3DState,
    setInteractiveComicState: runtimes.interactiveComic.setInteractiveComicState,
    setDocumentState: runtimes.document.setDocumentState,
    setDocumentEntityContent: runtimes.document.setDocumentEntityContent,
  };
}

/** Wire shape for a collaborative document snapshot (#2243). Carries the raw
 *  per-kind editor state (NOT the persisted timelineSpec form — that's lossy
 *  to round-trip). Only the active kind's slice plus the always-present
 *  `title`/`canvasState` are populated. */
export interface CollabDocShape {
  title?: string;
  canvasState?: CanvasState;
  imageState?: ImageState;
  animationState?: AnimationState;
  gameState?: GameState;
  cadState?: CadState;
  cad3dState?: Cad3DState;
  interactiveComicState?: InteractiveComicState;
  documentState?: DocumentState;
  entityContent?: DocumentEntityContent;
}

/** The runtime slices the local (localStorage) draft can carry beside the
 *  always-present title + CanvasState. */
export type LocalDraftSource = Pick<StudioStateSnapshot, "imageState" | "documentState">;

export interface FormatRuntime {
  family: StudioToolFamily;
  /** The runtime's state has hydrated, so its canvas can mount (the
   *  project-ready render gate and the server-autosave gate). Image /
   *  animation / game canvases mount null until their state hydrates;
   *  Timeline kinds are seeded synchronously. */
  hydrated: (runtimes: StudioRuntimes) => boolean;
  /** Beyond `hydrated`: the runtime's draft is ready to persist (server
   *  autosave). A document waits for its DocumentState to hydrate. */
  saveReady: (runtimes: StudioRuntimes) => boolean;
  /** Whether the right slot has an inspector for this format right now —
   *  the ONE decision the right slot (before the editor's early returns)
   *  and the format surface's inspector both read. */
  hasInspector: (runtimes: StudioRuntimes) => boolean;
  collab: {
    /** The active kind's slice of a collaborative snapshot. */
    get: (snapshot: StudioStateSnapshot) => CollabDocShape;
    /** Write a peer snapshot's active-kind slice into the live state. */
    apply: (doc: CollabDocShape, writers: StudioStateWriters) => void;
  };
  /** The active kind's slice of the local draft (beside title + state). */
  localDraft: (source: LocalDraftSource) => Record<string, unknown>;
  /** Per-kind content predicate from LOCAL kind-state, so an in-editor
   *  change enables Export without a save round-trip. */
  hasContent: (snapshot: StudioStateSnapshot) => boolean;
  /** The 3D world's game state when this is one (Roblox export, invites). */
  world3d: (snapshot: StudioStateSnapshot) => GameState | null;
}

const always = () => true;
const never = () => false;
const noSlice = () => ({});
const notWorld3d = () => null;
const canvasHasWidgets = (s: StudioStateSnapshot) => s.canvasState.scenes.some((scene) => scene.widgets.length > 0);

/** The Timeline runtime's defaults; each other runtime overrides its rules. */
const TIMELINE: FormatRuntime = {
  family: RUNTIME_FAMILY.timeline,
  hydrated: always,
  saveReady: always,
  // Every Timeline-chrome kind edits through the PropertiesPanel.
  hasInspector: always,
  collab: {
    get: noSlice,
    apply: (doc, w) => {
      const v = doc.canvasState;
      if (v) w.setCanvasState(() => v);
    },
  },
  localDraft: noSlice,
  hasContent: canvasHasWidgets,
  world3d: notWorld3d,
};

export const FORMAT_RUNTIMES: Record<StudioRuntimeKey, FormatRuntime> = {
  timeline: TIMELINE,
  image: {
    ...TIMELINE,
    family: RUNTIME_FAMILY.image,
    hydrated: (r) => r.image.imageStateHydrated,
    // The AI prompt inspector.
    hasInspector: always,
    collab: {
      get: (s) => ({ imageState: s.imageState }),
      apply: (doc, w) => {
        const v = doc.imageState;
        if (v) w.setImageState(() => v);
      },
    },
    localDraft: (s) => ({ imageState: s.imageState }),
    hasContent: always,
  },
  animation: {
    ...TIMELINE,
    family: RUNTIME_FAMILY.animation,
    hydrated: (r) => r.animation.animationStateHydrated,
    hasInspector: never,
    collab: {
      get: (s) => ({ animationState: s.animationState }),
      apply: (doc, w) => {
        const v = doc.animationState;
        if (v) w.setAnimationState(() => v);
      },
    },
  },
  game: {
    ...TIMELINE,
    family: RUNTIME_FAMILY.game,
    // Null-sentinel hydration: `gameState !== null` IS the signal.
    hydrated: (r) => r.game.gameState !== null,
    hasInspector: (r) => r.game.gameState !== null,
    collab: {
      get: (s) => (s.gameState ? { gameState: s.gameState } : {}),
      apply: (doc, w) => {
        const v = doc.gameState;
        if (v) w.setGameState(() => v);
      },
    },
    hasContent: (s) => !!s.gameState && s.gameState.levels.length > 0,
    world3d: (s) => (s.gameState?.engine === "world-3d" ? s.gameState : null),
  },
  cad: {
    ...TIMELINE,
    family: RUNTIME_FAMILY.cad,
    hasInspector: never,
    collab: {
      get: (s) => ({ cadState: s.cadState }),
      apply: (doc, w) => {
        const v = doc.cadState;
        if (v) w.setCadState(() => v);
      },
    },
  },
  cad_3d: {
    ...TIMELINE,
    family: RUNTIME_FAMILY.cad_3d,
    hasInspector: never,
    collab: {
      get: (s) => ({ cad3dState: s.cad3dState }),
      apply: (doc, w) => {
        const v = doc.cad3dState;
        if (v) w.setCad3DState(() => v);
      },
    },
  },
  interactive_comic: {
    ...TIMELINE,
    family: RUNTIME_FAMILY.interactive_comic,
    // The branch graph rides beside the Timeline-authored pages; a peer's
    // snapshot writes the graph only.
    collab: {
      get: (s) => ({ interactiveComicState: s.interactiveComicState }),
      apply: (doc, w) => {
        const v = doc.interactiveComicState;
        if (v) w.setInteractiveComicState(() => v);
      },
    },
  },
  document: {
    ...TIMELINE,
    family: RUNTIME_FAMILY.document,
    saveReady: (r) => r.document.documentStateHydrated,
    // A job's screening setup (#1918) / a company's embed settings (#1915).
    hasInspector: (r) => documentHasInspector(r.document.documentState),
    collab: {
      get: (s) => ({ documentState: s.documentState, entityContent: s.documentEntityContent ?? undefined }),
      apply: (doc, w) => {
        if (doc.documentState) {
          const ds = doc.documentState;
          w.setDocumentState(() => ds);
        }
        if (doc.entityContent !== undefined) w.setDocumentEntityContent(doc.entityContent);
      },
    },
    localDraft: (s) => ({ documentState: s.documentState }),
  },
};

/** The runtime descriptor for a media kind. */
export function formatRuntimeFor(kind: MediaKind): FormatRuntime {
  return FORMAT_RUNTIMES[runtimeKeyFor(kind)];
}
