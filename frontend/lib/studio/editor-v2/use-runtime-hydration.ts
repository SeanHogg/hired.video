/**
 * Per-kind runtime hydration for the editor's format runtimes — each
 * `useKindHydration` call owns one runtime's lifecycle (seed / read
 * serverState / unhydrate). The game runtime hydrates separately (after the
 * document entity) via `useGameHydration`. Which runtime a kind is active on
 * comes from the format-runtime descriptor (`runtimeKeyFor`).
 */
import { useEffect } from "react";
import type { MediaKind } from "@shared/media-kinds";
import type { ImageState } from "@shared/image-state";
import type { AnimationState } from "@shared/animation-state";
import { type CadState, createBlankCadState } from "@shared/cad-state";
import { type Cad3DState, createBlankCad3DState } from "@shared/cad-3d-state";
import {
  type InteractiveComicState,
  createBlankInteractiveComicState,
} from "@shared/interactive-comic-state";
import type { GameState } from "@shared/game-state";
import type { StudioProject } from "@/lib/services/studio-service";
import { seedImageFromTemplate } from "@/lib/studio/image/image-seeds";
import { seedAnimationFromTemplate } from "@/lib/studio/animation/animation-seeds";
import { normalizeStartLevelId as gameNormalizeStartLevelId } from "@/lib/studio/game/game-state-edit";
import { findStartLevel } from "@/lib/studio/game/runtime";
import { type DocumentState, createBlankDocumentState } from "./document-state";
import { useKindHydration } from "./use-kind-hydration";
import { readLocalDocumentDraft } from "./use-local-draft";
import { runtimeKeyFor } from "./format-runtime";
import type { GameRuntime, StudioRuntimes } from "./use-history-runtimes";

export interface RuntimeHydrationInput {
  currentMediaKind: MediaKind;
  persistedProject: StudioProject | null;
  templateHint: string | null;
  projectId: string;
  runtimes: Omit<StudioRuntimes, "game">;
}

export function useRuntimeHydration({
  currentMediaKind,
  persistedProject,
  templateHint,
  projectId,
  runtimes,
}: RuntimeHydrationInput) {
  const { imageStateHydrated, resetImageHistory, setImageStateHydrated } = runtimes.image;
  const { animationStateHydrated, resetAnimationHistory, setAnimationStateHydrated } = runtimes.animation;
  const { cadStateHydrated, resetCadHistory, setCadStateHydrated } = runtimes.cad;
  const { cad3DStateHydrated, resetCad3DHistory, setCad3DStateHydrated } = runtimes.cad3d;
  const {
    interactiveComicStateHydrated,
    resetInteractiveComicHistory,
    setInteractiveComicStateHydrated,
  } = runtimes.interactiveComic;
  const { documentStateHydrated, resetDocumentHistory, setDocumentStateHydrated } = runtimes.document;
  const runtimeKey = runtimeKeyFor(currentMediaKind);

  // Per-kind runtime hydration — three previously-bespoke useEffect
  // blocks unified through `useKindHydration` (closes the studio-
  // audit DRY finding). Each hook call owns one runtime's lifecycle:
  //   - kind matches + not hydrated → seed (or read serverState)
  //   - kind doesn't match + was hydrated → unhydrate
  //   - kind matches + already hydrated → no-op (preserves edits)
  // Adding a new mediaKind = one more `useKindHydration` call here.
  useKindHydration<ImageState>({
    active: runtimeKey === "image",
    hydrated: imageStateHydrated,
    serverState: persistedProject?.imageState as ImageState | null | undefined,
    seed: () => seedImageFromTemplate(templateHint),
    hydrate: (next) => {
      // `reset` (not `setState`) clears past/future stacks so undo
      // can't take the user below the just-loaded server state —
      // mirrors the Timeline runtime's resetHistory behavior.
      resetImageHistory(next);
      setImageStateHydrated(true);
    },
    unhydrate: () => setImageStateHydrated(false),
  });

  useKindHydration<AnimationState>({
    active: runtimeKey === "animation",
    hydrated: animationStateHydrated,
    serverState: persistedProject?.animationState as AnimationState | null | undefined,
    seed: () => seedAnimationFromTemplate(templateHint),
    hydrate: (next) => {
      resetAnimationHistory(next);
      setAnimationStateHydrated(true);
    },
    unhydrate: () => setAnimationStateHydrated(false),
  });

  useKindHydration<CadState>({
    active: runtimeKey === "cad",
    hydrated: cadStateHydrated,
    serverState: persistedProject?.cadState as CadState | null | undefined,
    seed: () => createBlankCadState(),
    hydrate: (next) => {
      resetCadHistory(next);
      setCadStateHydrated(true);
    },
    unhydrate: () => setCadStateHydrated(false),
  });

  // 3D CAD hydration (#930 Phase 2). The persisted column is `cad3dState`
  // (kebab → camel in the runtime payload), parsed once on first render
  // for cad_3d-kind projects.
  useKindHydration<Cad3DState>({
    active: runtimeKey === "cad_3d",
    hydrated: cad3DStateHydrated,
    serverState: persistedProject?.cad3dState as Cad3DState | null | undefined,
    seed: () => createBlankCad3DState(),
    hydrate: (next) => {
      resetCad3DHistory(next);
      setCad3DStateHydrated(true);
    },
    unhydrate: () => setCad3DStateHydrated(false),
  });

  // Interactive-comic (Comic+) hydration (#1960 / #2126). Persisted column is
  // `interactiveComicState`; seeded as a blank branch graph for a fresh draft.
  // Same pattern as the other non-Timeline runtimes.
  useKindHydration<InteractiveComicState>({
    active: runtimeKey === "interactive_comic",
    hydrated: interactiveComicStateHydrated,
    serverState: persistedProject?.interactiveComicState as
      | InteractiveComicState
      | null
      | undefined,
    seed: () => createBlankInteractiveComicState(),
    hydrate: (next) => {
      resetInteractiveComicHistory(next);
      setInteractiveComicStateHydrated(true);
    },
    unhydrate: () => setInteractiveComicStateHydrated(false),
  });

  // Document hydration (#1912). Persisted column is `documentState`; seeded
  // as a blank resume document for a fresh draft. Same pattern as the other
  // non-Timeline runtimes.
  useKindHydration<DocumentState>({
    active: runtimeKey === "document",
    hydrated: documentStateHydrated,
    serverState: persistedProject?.documentState as DocumentState | null | undefined,
    // Prefer a locally-autosaved draft (a signed-out visitor's in-progress
    // resume / job — #2212) before seeding a blank document, so their work
    // survives a reload and the signup → verify round-trip.
    seed: () =>
      readLocalDocumentDraft(projectId) ??
      createBlankDocumentState("resume", () => crypto.randomUUID()),
    hydrate: (next) => {
      resetDocumentHistory(next);
      setDocumentStateHydrated(true);
    },
    unhydrate: () => setDocumentStateHydrated(false),
  });
}

export function useGameHydration(
  currentMediaKind: MediaKind,
  persistedProject: StudioProject | null,
  game: GameRuntime,
) {
  const { gameState, setGameState, gameSelection, setGameSelection } = game;

  // Game uses the null-sentinel hydration pattern instead of a
  // separate boolean flag — `gameState !== null` IS the hydration
  // signal. No local `seed` because the first-save pipeline
  // (`seedGameFromTemplate` in `useCreateStudioDraft`) writes
  // gameState upstream before this hook fires; this hook waits.
  useKindHydration<GameState>({
    active: runtimeKeyFor(currentMediaKind) === "game",
    hydrated: gameState !== null,
    serverState: persistedProject?.gameState as
      | GameState
      | null
      | undefined,
    // Self-heal a dangling startLevelId on load (legacy projects) so the
    // selection + dropdown resolve and a valid id persists on next save.
    hydrate: (next) => setGameState(gameNormalizeStartLevelId(next)),
    unhydrate: () => setGameState(null),
  });

  // Default the editor's selection to the project's startLevelId once
  // gameState hydrates — the user lands on the level the runtime would
  // mount on Playtest. Subsequent edits don't re-fire (selection stays
  // wherever the user puts it during the session).
  useEffect(() => {
    if (!gameState || gameSelection.kind !== "canvas") return;
    // Resolve through `findStartLevel` (find-by-id, fall back to
    // levels[0]) — NOT raw `startLevelId`, which can dangle (e.g. a seed
    // that overwrote levels[0] without updating startLevelId). Selecting
    // a non-existent level made GamePropertiesPanel reset to canvas
    // mid-render, re-firing this effect forever (infinite flash).
    const startId = findStartLevel(gameState)?.id;
    if (startId) setGameSelection({ kind: "level", levelId: startId });
  }, [gameState, gameSelection.kind]);
}
