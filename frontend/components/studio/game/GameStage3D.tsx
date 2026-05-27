/**
 * GameStage3D — host for `engine === "world-3d"` projects. Mounts the
 * R3F Canvas, the Rapier physics world, edit-mode authoring chrome
 * (block palette + right-rail dock w/ Inspector + Challenges + AI
 * agent), and play-mode chrome (challenge HUD, respawn). Invite share-
 * link dialog is reachable from both modes (gap #1637).
 *
 * Per the project DRY rule, every authoring action routes through the
 * shared world-3d-edit helpers — the agent's server-side tool dispatch
 * (Phase 5) and the human-author UI hit the same mutation seam.
 * Selection / drag / click-to-place handlers live here; mode chrome
 * lives in the child panels (each self-gates its visibility).
 *
 * Symmetric with the 2D `<GameStage>`:
 *   - mode="edit" — orbit camera, ground-click drops a block from the
 *     palette, click an entity to select, Delete removes it.
 *   - mode="play" — first-person controller, WASD + jump, pointer
 *     lock on click, Escape to release. Challenge HUD updates from
 *     sensor-trigger events.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Gamepad2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  GameState,
  World3DEntityKind,
} from "@shared/game-state";
import {
  addEntity,
  deleteEntity,
  ensureWorld,
  getWorld,
} from "@/lib/studio/game/world-3d-edit";
import {
  applyChallengeEvent,
  initChallengeRuntime,
  type ChallengeRuntimeState,
} from "@/lib/studio/game/challenge-runtime";
import { useGameRoom } from "@/lib/studio/game/use-game-room";
import { saveCachedGameState } from "@/lib/studio/game/game-state-cache";
import { useAuth } from "@/lib/auth";
import Scene3D from "./world-3d/Scene3D";
import ChallengeHUD from "./world-3d/ChallengeHUD";
import DropPlacer, { type DropPlacerHandler } from "./world-3d/DropPlacer";
import { ENTITY_DRAG_MIME } from "./world-3d/EntityPaletteLeft";
import { ASSET_DRAG_MIME } from "./SpritePalette";
import type { EntityTriggerEvent } from "./world-3d/EntityMesh";

interface GameStage3DProps {
  gameState: GameState | null;
  mode: "edit" | "play";
  /** Called whenever an authoring action mutates the GameState. The
   *  host's `setGameState` is the only writer; this component never
   *  holds the state itself (DRY: one source of truth, the studio
   *  project). */
  onChange: (next: GameState) => void;
  /** Persisted project id — required by the AI agent + invite routes
   *  (both server endpoints address the row by id). Null for unsaved
   *  drafts; the affected panels gracefully degrade. */
  projectId?: string | null;
  /** Zoom multiplier — same contract as the 2D `<GameStage>`. The
   *  wrapper applies the scale to its CSS dimensions; R3F detects the
   *  resize via its built-in ResizeObserver and re-renders at the new
   *  pixel size (so the canvas stays sharp at every zoom level — no
   *  blurry bitmap scale). The wrapper's drop receiver uses the
   *  scaled bounding rect for the raycast so drop placement stays
   *  accurate at any zoom. */
  zoom?: number;
  /** Currently-selected entity id — supplied by the parent via
   *  `gameSelection` so the right-rail Game3DPropertiesPanel + the
   *  scene render-time outline share one selection bus (DRY). */
  selectedEntityId?: string | null;
  /** Selection setter — bubbles entity clicks back to the parent,
   *  which writes them into `gameSelection`. When omitted (read-only
   *  surfaces like ProjectPlayer), entity clicks no-op. */
  onSelectEntity?: (entityId: string | null) => void;
  hideRuntimeBanner?: boolean;
  className?: string;
}

export default function GameStage3D({
  gameState,
  mode,
  onChange,
  projectId = null,
  zoom = 1,
  selectedEntityId = null,
  onSelectEntity,
  hideRuntimeBanner = false,
  className,
}: GameStage3DProps) {
  // ─── Local UI state ───────────────────────────────────────────────────
  // Palette / selection / invite-dialog state are all OUT of this
  // component now: palette → left rail (StudioEditorV2),
  // selection → gameSelection (StudioEditorV2), invite → header
  // (StudioEditorV2). What's left here is canvas-local only.
  const [respawnNonce, setRespawnNonce] = useState(0);
  /** Drop dispatch — DropPlacer (inside the R3F Canvas) sets this on
   *  mount; the outer drop event reads from `.current` so the HTML5
   *  drop handler can reach into R3F's camera + canvas for the
   *  raycast. */
  const dropHandlerRef = useRef<DropPlacerHandler | null>(null);
  /** Selection setter that falls back to a no-op when the parent
   *  didn't wire `onSelectEntity` (e.g. ProjectPlayer mounting the
   *  read-only public surface). DRY: every caller of this stays
   *  unaware of whether selection is wired. */
  const selectEntity = useCallback(
    (id: string | null) => {
      onSelectEntity?.(id);
    },
    [onSelectEntity],
  );

  const world = gameState ? getWorld(gameState) : null;

  // ─── Multiplayer room (gap #1636) ─────────────────────────────────────
  // The room is enabled when the project is persisted (has a projectId)
  // AND we're in play mode AND the env var is configured. Self-gated
  // inside the hook — when any predicate fails it returns a no-op
  // stub with `connected: false` / empty peers. Single seam — no
  // prop-drilled `isMultiplayerActive` boolean.
  const { user } = useAuth();
  const roomIdentity = user
    ? { userId: user.id, displayName: user.name ?? user.email ?? "Player" }
    : null;
  const room = useGameRoom(projectId, roomIdentity, mode === "play");

  // PWA / offline support: mirror every gameState write to IndexedDB
  // so a reload-with-no-network still opens the editor on the latest
  // local snapshot. The studio service is still the SSoT for the
  // server row — this is a side-channel that lets the editor open
  // instantly + survive flight-mode editing. Fire-and-forget; the
  // helper self-gates when indexedDB isn't available.
  useEffect(() => {
    if (!projectId || !gameState) return;
    if (gameState.engine !== "world-3d") return;
    void saveCachedGameState(projectId, gameState);
  }, [projectId, gameState]);

  // Ensure the world exists on first mount.
  useEffect(() => {
    if (!gameState) return;
    if (gameState.engine !== "world-3d") return;
    if (gameState.world) return;
    onChange(ensureWorld(gameState));
  }, [gameState, onChange]);

  // ─── Challenge runtime (play mode) ────────────────────────────────────
  // Re-initialized when play mode starts so each play session starts
  // fresh. The `applyChallengeEvent` reducer is the SSoT for progress
  // semantics — HUD reads from this state.
  const [challengeRuntime, setChallengeRuntime] = useState<ChallengeRuntimeState | null>(null);

  useEffect(() => {
    if (mode !== "play" || !world) {
      setChallengeRuntime(null);
      return;
    }
    setChallengeRuntime(initChallengeRuntime(world.challenges, Date.now()));
  }, [mode, world?.challenges, respawnNonce]);

  // 250ms ticker drives timer challenges. No-op when there are no
  // timer-kind challenges in the world (the reducer ignores
  // non-timer challenges on tick events).
  const challengesRef = useRef(world?.challenges ?? []);
  challengesRef.current = world?.challenges ?? [];
  useEffect(() => {
    if (mode !== "play") return;
    if (!challengesRef.current.some((c) => c.kind === "timer")) return;
    const id = window.setInterval(() => {
      setChallengeRuntime((prev) => {
        if (!prev) return prev;
        const { state: next } = applyChallengeEvent(prev, challengesRef.current, {
          kind: "tick",
          nowMs: Date.now(),
        });
        return next;
      });
    }, 250);
    return () => window.clearInterval(id);
  }, [mode, respawnNonce]);

  // ─── Trigger event → challenge progress + server award ────────────────
  const handleTrigger = useCallback(
    (event: EntityTriggerEvent) => {
      if (mode !== "play") return;
      setChallengeRuntime((prev) => {
        if (!prev) return prev;
        const { state: next, justCompleted } = applyChallengeEvent(
          prev,
          challengesRef.current,
          { kind: "trigger", event },
        );
        // Award points for each just-completed challenge via the
        // shared `room.claimChallenge` seam. Single-player still
        // works (the hook self-gates — direct fetch when the room
        // isn't enabled); multiplayer adds a peer-broadcast on top.
        // DRY: one award path for single + multiplayer.
        if (justCompleted.length > 0) {
          for (const challengeId of justCompleted) {
            room.claimChallenge(challengeId);
          }
        }
        // Hazards reset the player. Same hook — no separate hazard handler.
        if (event.kind === "hazard") {
          setRespawnNonce((n) => n + 1);
        }
        return next;
      });
    },
    [mode, projectId],
  );

  // ─── Delete-key shortcut ──────────────────────────────────────────────
  useEffect(() => {
    if (mode !== "edit") return;
    const onKey = (e: KeyboardEvent) => {
      if (!selectedEntityId) return;
      if (e.code !== "Delete" && e.code !== "Backspace") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (!gameState) return;
      onChange(deleteEntity(gameState, selectedEntityId));
      selectEntity(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, selectedEntityId, gameState, onChange, selectEntity]);

  // ─── Click-to-place ───────────────────────────────────────────────────
  /** Place a primitive-kind entity at a raycast position. */
  const placePrimitive = useCallback(
    (kind: World3DEntityKind, position: [number, number, number]) => {
      if (!gameState) return;
      const result = addEntity(gameState, {
        kind,
        // Lift entities so they sit on the ground rather than partially
        // submerged — default scale half-heights keep the base at y=0.
        position: [position[0], position[1] + 0.5, position[2]],
      });
      onChange(result.state);
      selectEntity(result.entity.id);
    },
    [gameState, onChange, selectEntity],
  );

  /** Place a textured entity from a dragged sprite / asset (gap #1659).
   *  Defaults to a `block` kind tinted white so the texture renders
   *  true to color. The author can swap kind / scale / physics from
   *  the inspector afterward. Same `addEntity` seam the AI agent +
   *  the primitive-drop path use (DRY). */
  const placeAsset = useCallback(
    (asset: { url: string; label: string }, position: [number, number, number]) => {
      if (!gameState) return;
      const result = addEntity(gameState, {
        kind: "block",
        position: [position[0], position[1] + 0.5, position[2]],
        color: "#ffffff",
        textureUrl: asset.url,
        tag: asset.label,
      });
      onChange(result.state);
      selectEntity(result.entity.id);
    },
    [gameState, onChange, selectEntity],
  );

  // ─── Empty states ─────────────────────────────────────────────────────
  if (!gameState) {
    return <EmptyShell className={className}>Pick a 3D world template to begin.</EmptyShell>;
  }
  if (!world) {
    return <EmptyShell className={className}>Initializing 3D world…</EmptyShell>;
  }

  return (
    <div className={cn("relative", className)}>
      <div
        className="relative overflow-hidden rounded-md shadow-lg"
        style={{
          width: `${gameState.width * zoom}px`,
          height: `${gameState.height * zoom}px`,
        }}
        aria-label={`3D world ${mode === "play" ? "playback" : "preview"}`}
        // Drop receiver — accepts the left-rail palette's drag
        // payload (mime `application/x-world3d-kind`) and forwards
        // to DropPlacer, which raycasts the cursor against the
        // ground plane to compute the world-space position.
        // Edit-mode only — play-mode drops are no-ops.
        onDragOver={(e) => {
          if (mode !== "edit") return;
          const types = e.dataTransfer.types;
          if (!types.includes(ENTITY_DRAG_MIME) && !types.includes(ASSET_DRAG_MIME)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(e) => {
          if (mode !== "edit") return;
          // Resolve the raycast position once; both drop kinds use the
          // same world-space hit. DropPlacer is pure — it doesn't know
          // what's being placed (DRY: one drop seam, every drag source).
          const position = dropHandlerRef.current?.(e.clientX, e.clientY);
          if (!position) return;
          e.preventDefault();
          // Primitive kind (drag from EntityPaletteLeft).
          const kind = e.dataTransfer.getData(ENTITY_DRAG_MIME) as World3DEntityKind | "";
          if (kind) {
            placePrimitive(kind, position);
            return;
          }
          // Sprite / asset (drag from SpritePalette tile or future
          // MediaPicker custom upload).
          const assetJson = e.dataTransfer.getData(ASSET_DRAG_MIME);
          if (assetJson) {
            try {
              const asset = JSON.parse(assetJson) as { url: string; label: string };
              if (asset.url) placeAsset(asset, position);
            } catch {
              // Malformed payload — ignore.
            }
          }
        }}
      >
        <Canvas
          shadows
          camera={{ position: [12, 10, 12], fov: 60, near: 0.1, far: 500 }}
          tabIndex={mode === "play" ? 0 : -1}
        >
          <Scene3D
            world={world}
            mode={mode}
            selectedEntityId={selectedEntityId}
            onSelectEntity={selectEntity}
            onTrigger={handleTrigger}
            respawnNonce={respawnNonce}
            peers={room.peers}
            onBroadcastPosition={room.broadcastPosition}
          />
          {/* Invisible — registers a pure raycast helper via the
              shared ref. The outer drop handler reads the dataTransfer
              MIME to decide whether to place a primitive or a textured
              asset; DropPlacer itself doesn't know which (DRY). */}
          {mode === "edit" && <DropPlacer handlerRef={dropHandlerRef} />}
        </Canvas>

        {/* Edit-mode chrome — the in-canvas overlays are gone. The
            authoring surfaces all live in the studio shell now (palette
            on the left rail, properties / challenges / AI on the right
            rail, Playtest + Invite in the header) per the project's
            existing chrome pattern. Same shape every other media kind
            uses (Image / Video / Animation / CAD). */}
        {mode === "edit" && !hideRuntimeBanner && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-3 py-2">
            <Gamepad2 className="h-4 w-4 text-fuchsia-300" />
            <span className="text-[11px] font-semibold text-white">
              Drag pieces from the left rail · click placed blocks to
              edit on the right · talk to the AI agent on the right
            </span>
          </div>
        )}

        {/* Play-mode chrome — challenge HUD + respawn live on the
            canvas because they're playback-time affordances (parity
            with the video editor's playback overlay). Playtest /
            Invite triggers stay in the header. */}
        {mode === "play" && (
          <>
            {challengeRuntime && (
              <ChallengeHUD challenges={world.challenges} runtime={challengeRuntime} />
            )}
            {!hideRuntimeBanner && (
              <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-center gap-2 bg-gradient-to-b from-black/70 via-black/30 to-transparent px-3 py-2">
                <Gamepad2 className="h-4 w-4 text-fuchsia-300" />
                <span className="text-[11px] font-semibold text-white">
                  Playtest · click canvas to lock pointer · WASD to move · Space to
                  jump · Esc to release
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={() => setRespawnNonce((n) => n + 1)}
              className="absolute bottom-3 left-3 z-20 rounded-full bg-fuchsia-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md hover:bg-fuchsia-500"
              title="Teleport back to spawn"
            >
              ↻ Respawn
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function EmptyShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex aspect-video w-[640px] flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/30 text-muted-foreground",
        className,
      )}
    >
      <Gamepad2 className="h-10 w-10 text-fuchsia-500" />
      <p className="mt-2 text-sm font-medium">3D world canvas</p>
      <p className="mt-1 text-xs">{children}</p>
    </div>
  );
}
