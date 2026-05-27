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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Gamepad2, UserPlus } from "lucide-react";
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
import RightRailDock from "./world-3d/RightRailDock";
import InspectorPanel from "./world-3d/InspectorPanel";
import ChallengesPanel from "./world-3d/ChallengesPanel";
import AIAgentPanel from "./world-3d/AIAgentPanel";
import ChallengeHUD from "./world-3d/ChallengeHUD";
import InviteDialog from "./world-3d/InviteDialog";
import DropPlacer, { type DropPlacerHandler } from "./world-3d/DropPlacer";
import { ENTITY_DRAG_MIME } from "./world-3d/EntityPaletteLeft";
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
  hideRuntimeBanner?: boolean;
  className?: string;
}

export default function GameStage3D({
  gameState,
  mode,
  onChange,
  projectId = null,
  hideRuntimeBanner = false,
  className,
}: GameStage3DProps) {
  // ─── Local UI state ───────────────────────────────────────────────────
  // Palette kind selection moved out of GameStage3D entirely — the
  // left-rail `<EntityPaletteLeft>` is the drag source; placement
  // happens via HTML5 drag-and-drop (see `dropHandlerRef` below).
  // No click-to-place state to track here.
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [respawnNonce, setRespawnNonce] = useState(0);
  const [inviteOpen, setInviteOpen] = useState(false);
  /** Drop dispatch — DropPlacer (inside the R3F Canvas) sets this on
   *  mount; the outer drop event reads from `.current` so the HTML5
   *  drop handler can reach into R3F's camera + canvas for the
   *  raycast. */
  const dropHandlerRef = useRef<DropPlacerHandler | null>(null);

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
      setSelectedEntityId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, selectedEntityId, gameState, onChange]);

  // ─── Click-to-place ───────────────────────────────────────────────────
  /** Drop-receiver — called by DropPlacer with the raycast hit point.
   *  Adds the dragged entity kind at that position via the shared
   *  mutation seam (same `addEntity` the AI agent uses — DRY). */
  const handlePlaceAt = useCallback(
    (kind: World3DEntityKind, position: [number, number, number]) => {
      if (!gameState) return;
      const result = addEntity(gameState, {
        kind,
        // Lift placed entities so they sit on the ground rather than
        // partially submerged — the default scale's half-height keeps
        // their base flush with y=0.
        position: [position[0], position[1] + 0.5, position[2]],
      });
      onChange(result.state);
      setSelectedEntityId(result.entity.id);
    },
    [gameState, onChange],
  );

  const selectedEntity = useMemo(() => {
    if (!world || !selectedEntityId) return null;
    return world.entities.find((e) => e.id === selectedEntityId) ?? null;
  }, [world, selectedEntityId]);

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
        style={{ width: `${gameState.width}px`, height: `${gameState.height}px` }}
        aria-label={`3D world ${mode === "play" ? "playback" : "preview"}`}
        // Drop receiver — accepts the left-rail palette's drag
        // payload (mime `application/x-world3d-kind`) and forwards
        // to DropPlacer, which raycasts the cursor against the
        // ground plane to compute the world-space position.
        // Edit-mode only — play-mode drops are no-ops.
        onDragOver={(e) => {
          if (mode !== "edit") return;
          if (!e.dataTransfer.types.includes(ENTITY_DRAG_MIME)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(e) => {
          if (mode !== "edit") return;
          const kind = e.dataTransfer.getData(ENTITY_DRAG_MIME) as World3DEntityKind;
          if (!kind) return;
          e.preventDefault();
          dropHandlerRef.current?.(kind, e.clientX, e.clientY);
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
            onSelectEntity={setSelectedEntityId}
            onTrigger={handleTrigger}
            respawnNonce={respawnNonce}
            peers={room.peers}
            onBroadcastPosition={room.broadcastPosition}
          />
          {/* Invisible — registers the drop→world raycast handler
              via the shared ref. Only active in edit mode; in play
              the ref stays null and the outer drop handler bails. */}
          {mode === "edit" && (
            <DropPlacer handlerRef={dropHandlerRef} onPlace={handlePlaceAt} />
          )}
        </Canvas>

        {/* Edit-mode chrome */}
        {mode === "edit" && (
          <>
            <RightRailDock
              mode="edit"
              inspector={
                <InspectorPanel
                  gameState={gameState}
                  selectedEntity={selectedEntity}
                  onChange={onChange}
                  onClearSelection={() => setSelectedEntityId(null)}
                />
              }
              challenges={<ChallengesPanel gameState={gameState} onChange={onChange} />}
              agent={<AIAgentPanel projectId={projectId} onApplyState={onChange} />}
            />
            {!hideRuntimeBanner && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-3 py-2">
                <Gamepad2 className="h-4 w-4 text-fuchsia-300" />
                <span className="text-[11px] font-semibold text-white">
                  3D world · drag a piece from the left rail into the
                  world · click a placed block to select · drag canvas
                  to orbit · or talk to the AI agent
                </span>
              </div>
            )}
          </>
        )}

        {/* Play-mode chrome */}
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

        {/* Invite — reachable from both modes (owners share play links,
            players in play mode also see the affordance so they can
            invite more friends mid-session if they're the owner). The
            dialog self-gates on the projectId; an unsaved draft just
            sees a "save first" message. */}
        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          className="absolute bottom-3 right-3 z-20 flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md hover:bg-emerald-500"
          title="Invite a friend to play"
        >
          <UserPlus className="h-3 w-3" />
          Invite
        </button>
        {inviteOpen && (
          <InviteDialog projectId={projectId} onClose={() => setInviteOpen(false)} />
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
