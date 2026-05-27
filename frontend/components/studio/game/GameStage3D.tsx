/**
 * GameStage3D — the canvas runtime surface for `engine === "world-3d"`
 * game projects (gap #1634). Mounts the R3F Canvas, the Rapier physics
 * world, the block palette (edit mode), the playtest toggle, and the
 * minimal HUD (play mode).
 *
 * Symmetric with the 2D `<GameStage>`:
 *   - `mode="edit"` — orbit camera, ground-click drops a block from
 *     the palette, click an entity to select, Delete key removes it.
 *   - `mode="play"` — first-person controller, WASD + jump, pointer
 *     lock on click, Escape to release.
 *
 * State writes route through the standard studio save pipeline — this
 * component is presentational + dispatches mutations through the
 * `onChange` prop that the host (`StudioEditorV2`) threads into the
 * same `setGameState` setter the 2D path uses (DRY: one persistence
 * pipeline for both 2D and 3D game projects).
 */

import { useCallback, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Gamepad2, Cuboid, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  GameState,
  World3DEntity,
  World3DEntityKind,
} from "@shared/game-state";
import {
  addEntity,
  deleteEntity,
  ensureWorld,
  getWorld,
  moveEntity,
} from "@/lib/studio/game/world-3d-edit";
import BlockPalette from "./world-3d/BlockPalette";
import Scene3D from "./world-3d/Scene3D";

interface GameStage3DProps {
  gameState: GameState | null;
  mode: "edit" | "play";
  /** Called whenever an authoring action mutates the GameState. The
   *  host's `setGameState` is the only writer; this component never
   *  holds the state itself (DRY: one source of truth, the studio
   *  project). */
  onChange: (next: GameState) => void;
  hideRuntimeBanner?: boolean;
  className?: string;
}

export default function GameStage3D({
  gameState,
  mode,
  onChange,
  hideRuntimeBanner = false,
  className,
}: GameStage3DProps) {
  // ─── Local UI state ───────────────────────────────────────────────────
  const [paletteKind, setPaletteKind] = useState<World3DEntityKind | null>("block");
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [respawnNonce, setRespawnNonce] = useState(0);

  // Ensure the world exists on first mount — covers the case where a
  // pre-existing GameState row has engine=world-3d but no `world`
  // field yet (e.g. a stub seeded before the schema landed).
  useEffect(() => {
    if (!gameState) return;
    if (gameState.engine !== "world-3d") return;
    if (gameState.world) return;
    onChange(ensureWorld(gameState));
  }, [gameState, onChange]);

  // Delete-key removes the selected entity in edit mode. Reuses the
  // canonical mutation so the inspector + the key handler share one
  // delete path (DRY).
  useEffect(() => {
    if (mode !== "edit") return;
    const onKey = (e: KeyboardEvent) => {
      if (!selectedEntityId) return;
      if (e.code !== "Delete" && e.code !== "Backspace") return;
      // Avoid stealing the key when the user is typing in an input.
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (!gameState) return;
      onChange(deleteEntity(gameState, selectedEntityId));
      setSelectedEntityId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, selectedEntityId, gameState, onChange]);

  const handlePlaceAt = useCallback(
    (position: [number, number, number]) => {
      if (!gameState || !paletteKind) return;
      const result = addEntity(gameState, {
        kind: paletteKind,
        // Lift placed entities so they sit on the ground rather than
        // partially submerged — the default scale's half-height keeps
        // their base flush with y=0.
        position: [position[0], position[1] + 0.5, position[2]],
      });
      onChange(result.state);
      setSelectedEntityId(result.entity.id);
    },
    [gameState, paletteKind, onChange],
  );

  const handleSelectEntity = useCallback((id: string | null) => {
    setSelectedEntityId(id);
  }, []);

  const handleDeleteSelected = useCallback(() => {
    if (!gameState || !selectedEntityId) return;
    onChange(deleteEntity(gameState, selectedEntityId));
    setSelectedEntityId(null);
  }, [gameState, selectedEntityId, onChange]);

  const handleNudgeUp = useCallback(() => {
    if (!gameState || !selectedEntityId) return;
    const world = getWorld(gameState);
    const entity = world?.entities.find((e) => e.id === selectedEntityId);
    if (!entity) return;
    onChange(
      moveEntity(gameState, selectedEntityId, [
        entity.position[0],
        entity.position[1] + 0.5,
        entity.position[2],
      ]),
    );
  }, [gameState, selectedEntityId, onChange]);

  // ─── Empty states ─────────────────────────────────────────────────────
  if (!gameState) {
    return <EmptyShell className={className}>Pick a 3D world template to begin.</EmptyShell>;
  }
  const world = getWorld(gameState);
  if (!world) {
    return <EmptyShell className={className}>Initializing 3D world…</EmptyShell>;
  }

  const selectedEntity: World3DEntity | null =
    selectedEntityId
      ? world.entities.find((e) => e.id === selectedEntityId) ?? null
      : null;

  return (
    <div className={cn("relative", className)}>
      <div
        className="relative overflow-hidden rounded-md shadow-lg"
        style={{ width: `${gameState.width}px`, height: `${gameState.height}px` }}
        aria-label={`3D world ${mode === "play" ? "playback" : "preview"}`}
      >
        <Canvas
          shadows
          camera={{ position: [12, 10, 12], fov: 60, near: 0.1, far: 500 }}
          // Pointer lock + drag-orbit need the canvas to receive focus;
          // tabIndex makes it keyboard-reachable in both modes.
          tabIndex={mode === "play" ? 0 : -1}
        >
          <Scene3D
            world={world}
            mode={mode}
            selectedEntityId={selectedEntityId}
            paletteKind={paletteKind}
            onSelectEntity={handleSelectEntity}
            onPlaceAt={handlePlaceAt}
            respawnNonce={respawnNonce}
          />
        </Canvas>

        {/* Edit-mode chrome */}
        {mode === "edit" && (
          <>
            <div className="pointer-events-auto absolute left-3 top-3 z-20">
              <BlockPalette activeKind={paletteKind} onPick={setPaletteKind} />
            </div>
            {selectedEntity && (
              <div className="pointer-events-auto absolute right-3 top-16 z-20 flex items-center gap-2 rounded-md border border-border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur">
                <Cuboid className="h-4 w-4 text-fuchsia-500" />
                <span className="font-mono">{selectedEntity.id}</span>
                <button
                  type="button"
                  onClick={handleNudgeUp}
                  className="rounded bg-muted px-2 py-1 hover:bg-muted-foreground/10"
                  title="Raise by 0.5m"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  className="flex items-center gap-1 rounded bg-rose-600 px-2 py-1 text-white hover:bg-rose-500"
                  title="Delete (Del)"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            )}
            {!hideRuntimeBanner && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-3 py-2">
                <Gamepad2 className="h-4 w-4 text-fuchsia-300" />
                <span className="text-[11px] font-semibold text-white">
                  3D world · pick a block, click ground to place · click block to
                  select · drag canvas to orbit
                </span>
              </div>
            )}
          </>
        )}

        {/* Play-mode chrome */}
        {mode === "play" && !hideRuntimeBanner && (
          <>
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-center gap-2 bg-gradient-to-b from-black/70 via-black/30 to-transparent px-3 py-2">
              <Gamepad2 className="h-4 w-4 text-fuchsia-300" />
              <span className="text-[11px] font-semibold text-white">
                Playtest · click canvas to lock pointer · WASD to move · Space to
                jump · Esc to release
              </span>
            </div>
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
