/**
 * The game runtime's canvas surface: `<GameStage>` (2D + 3D worlds) bound to
 * the editor's local game state and its shared selection.
 */
import GameStage from "@/components/studio/game/GameStage";
import { updateSprite as gameUpdateSprite } from "@/lib/studio/game/game-state-edit";
import { savedProjectIdFromRoute } from "@/lib/studio/editor-v2/use-studio-project-lifecycle";
import type { GameSurfaceCtx } from "../types";

export function gameCanvas(ctx: GameSurfaceCtx) {
  const { gameState, setGameState, gameSelection, setGameSelection, activeLevelId, selectedSpriteId } =
    ctx.game;
  return (
    <div className="relative">
      <GameStage
        // Reads LOCAL `gameState` so in-editor
        // mutations (add level / move sprite /
        // change behavior) refresh the canvas
        // immediately without waiting for a save
        // round-trip.
        gameState={gameState}
        zoom={ctx.zoom}
        mode={ctx.gamePlaying ? "play" : "edit"}
        // Selection props — canvas reflects what
        // the user picked in the left rail; clicks
        // on the canvas update the shared
        // `gameSelection` so the right rail swaps
        // to the clicked sprite's inspector.
        activeLevelId={activeLevelId}
        selectedSpriteId={selectedSpriteId}
        onSelectSprite={(spriteId) => {
          if (!activeLevelId) return;
          if (spriteId) {
            setGameSelection({ kind: "sprite", levelId: activeLevelId, spriteId });
          } else {
            setGameSelection({ kind: "level", levelId: activeLevelId });
          }
        }}
        onMoveSprite={(spriteId, x, y) => {
          if (!activeLevelId) return;
          // Reuse the canonical sprite-update helper
          // so drag-to-move + the inspector's x/y
          // fields share one mutation path (DRY).
          setGameState((prev) =>
            prev ? gameUpdateSprite(prev, activeLevelId, spriteId, { x, y }) : prev,
          );
        }}
        // Whole-state writer — the 3D path
        // (engine === "world-3d") routes every
        // mutation through here so place / select /
        // delete / inspector edits all converge on
        // the same `setGameState` setter the 2D
        // path uses (DRY: one persistence pipeline).
        // The 2D path ignores `onChange` and keeps
        // using the fine-grained sprite handlers.
        onChange={setGameState}
        // The 3D agent + invite endpoints address
        // the project by id — pass through so the
        // panels can hit /api/games/:id/...
        // Null for an unsaved "new" draft
        // draft); the panels self-gate ("Save
        // first" message). DRY: one prop, all 3D
        // server surfaces.
        projectId={savedProjectIdFromRoute(ctx.routeProjectId)}
        // 3D entity selection bus — shared with
        // the right-rail Game3DPropertiesPanel so
        // clicking an entity in the canvas updates
        // the inspector and vice-versa.
        selectedEntityId={
          gameSelection.kind === "entity-3d"
            ? gameSelection.entityId
            : null
        }
        onSelectEntity={(entityId) =>
          setGameSelection(
            entityId
              ? { kind: "entity-3d", entityId }
              : { kind: "canvas" },
          )
        }
      />
      {/* Playtest moved to the studio header (next
          to Save) per the existing pattern — the
          video editor's Preview button lives there
          too. The canvas no longer carries
          overlay chrome; selection + edit affordances
          live in the left rail (palette) + right
          rail (properties / challenges / AI). */}
      {ctx.aiChipNode}
    </div>
  );
}
