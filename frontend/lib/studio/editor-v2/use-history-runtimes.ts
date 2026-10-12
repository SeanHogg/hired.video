/**
 * The non-Timeline format runtimes that are a history-wrapped state plus a
 * hydrated flag: CAD, 3D CAD, interactive comic and document. Same
 * parallel-history pattern as the image + animation runtimes — each history
 * wrapper is mounted unconditionally so undo/redo participates without a
 * per-kind branch. Lifted out of StudioEditorV2; `StudioRuntimes` bundles
 * every format runtime for the modules that read across them.
 */
import { useState } from "react";
import { type CadState, createBlankCadState } from "@shared/cad-state";
import { type Cad3DState, createBlankCad3DState } from "@shared/cad-3d-state";
import {
  type InteractiveComicState,
  createBlankInteractiveComicState,
} from "@shared/interactive-comic-state";
import {
  type DocumentEntityContent,
  type DocumentState,
  createBlankDocumentState,
} from "./document-state";
import { useCanvasHistory } from "./use-canvas-history";
import type { ImageRuntime } from "./use-image-runtime";
import type { useAnimationRuntime } from "./use-animation-runtime";
import type { useGameRuntime } from "./use-game-runtime";

export function useCadRuntime() {
  // CAD runtime state (#930) — same parallel-history pattern as the
  // image + animation runtimes. The history wrapper is mounted
  // unconditionally so undo/redo participates without a per-kind
  // branch.
  const cadHistory = useCanvasHistory<CadState>(() => createBlankCadState());
  const {
    state: cadState,
    setState: setCadState,
    commit: cadCommit,
    reset: resetCadHistory,
  } = cadHistory;
  const [cadStateHydrated, setCadStateHydrated] = useState(false);
  return { cadState, setCadState, cadCommit, resetCadHistory, cadStateHydrated, setCadStateHydrated };
}

export function useCad3DRuntime() {
  // 3D CAD runtime state (#930 Phase 2) — same parallel-history pattern
  // as the 2D CAD runtime. Rides the same Three.js + R3F stack as the
  // 3D World game studio (per [[project_3d_world_game_studio]]).
  const cad3DHistory = useCanvasHistory<Cad3DState>(() => createBlankCad3DState());
  const {
    state: cad3DState,
    setState: setCad3DState,
    commit: cad3DCommit,
    reset: resetCad3DHistory,
  } = cad3DHistory;
  const [cad3DStateHydrated, setCad3DStateHydrated] = useState(false);
  return { cad3DState, setCad3DState, cad3DCommit, resetCad3DHistory, cad3DStateHydrated, setCad3DStateHydrated };
}

export function useInteractiveComicRuntime() {
  // Interactive-comic (Comic+) branching choice graph (#1960 / #2126) — same
  // parallel-history pattern as the other non-Timeline runtimes. The per-page
  // CanvasState is authored on the Timeline shell; THIS holds the branch graph.
  // Shape in `shared/interactive-comic-state.ts`.
  const interactiveComicHistory = useCanvasHistory<InteractiveComicState>(() =>
    createBlankInteractiveComicState(),
  );
  const {
    state: interactiveComicState,
    setState: setInteractiveComicState,
    reset: resetInteractiveComicHistory,
  } = interactiveComicHistory;
  const [interactiveComicStateHydrated, setInteractiveComicStateHydrated] =
    useState(false);
  return {
    interactiveComicState,
    setInteractiveComicState,
    resetInteractiveComicHistory,
    interactiveComicStateHydrated,
    setInteractiveComicStateHydrated,
  };
}

export function useDocumentRuntime() {
  // Document runtime state (#1912) — paged WYSIWYG resume / job / article /
  // blog. Same parallel-history pattern as the other non-Timeline runtimes;
  // shape in `editor-v2/document-state.ts`.
  const documentHistory = useCanvasHistory<DocumentState>(() =>
    createBlankDocumentState("resume", () => crypto.randomUUID()),
  );
  const {
    state: documentState,
    setState: setDocumentState,
    commit: documentCommit,
    reset: resetDocumentHistory,
    undo: documentUndo,
    redo: documentRedo,
    canUndo: documentCanUndo,
    canRedo: documentCanRedo,
  } = documentHistory;
  const [documentStateHydrated, setDocumentStateHydrated] = useState(false);
  // The bound entity's CONTENT for a document project (resume today). Lives
  // separately from DocumentState (which is layout/structure) — content is
  // owned by the resume row. Seeded blank for a fresh draft; fetched from the
  // resume row when DocumentState.entityId is set; persisted back on save.
  const [documentEntityContent, setDocumentEntityContent] =
    useState<DocumentEntityContent | null>(null);
  return {
    documentState,
    setDocumentState,
    documentCommit,
    resetDocumentHistory,
    documentUndo,
    documentRedo,
    documentCanUndo,
    documentCanRedo,
    documentStateHydrated,
    setDocumentStateHydrated,
    documentEntityContent,
    setDocumentEntityContent,
  };
}

export type AnimationRuntime = ReturnType<typeof useAnimationRuntime>;
export type GameRuntime = ReturnType<typeof useGameRuntime>;
export type CadRuntime = ReturnType<typeof useCadRuntime>;
export type Cad3DRuntime = ReturnType<typeof useCad3DRuntime>;
export type InteractiveComicRuntime = ReturnType<typeof useInteractiveComicRuntime>;
export type DocumentRuntime = ReturnType<typeof useDocumentRuntime>;

/** Every non-Timeline format runtime the editor composes (the Timeline's
 *  CanvasState history is the editor's own). */
export interface StudioRuntimes {
  image: ImageRuntime;
  animation: AnimationRuntime;
  game: GameRuntime;
  cad: CadRuntime;
  cad3d: Cad3DRuntime;
  interactiveComic: InteractiveComicRuntime;
  document: DocumentRuntime;
}
