/**
 * Game3DPropertiesPanel — right-rail properties surface for
 * `engine === "world-3d"` projects. Mounts in the same
 * [CollapsiblePanel](../../v2/CollapsiblePanel.tsx) slot the 2D
 * mini-game uses for [GamePropertiesPanel](../GamePropertiesPanel.tsx)
 * and the Image surface uses for `DrawingAiPromptPanel` — one shell,
 * kind-aware contents per the studio's existing DRY pattern.
 *
 * Selection-aware:
 *   - `selection.kind === "entity-3d"` → renders the inspector for
 *     the selected entity (position / rotation / scale / color /
 *     physics / tag). Same mutation seam the AI agent uses.
 *   - Otherwise → renders canvas-level settings (width / height / fps
 *     + ground / sky / lighting / spawn) so the right rail isn't empty
 *     when nothing's selected.
 */

import type { GameSelection } from "../GamePropertiesPanel";
import type { GameState } from "@shared/game-state";
import { getWorld, updateGround, updateSkyColor, updateSpawn } from "@/lib/studio/game/world-3d-edit";
import InspectorPanel from "./InspectorPanel";

interface Game3DPropertiesPanelProps {
  gameState: GameState;
  onChange: (next: GameState) => void;
  selection: GameSelection;
  onSelectionChange: (next: GameSelection) => void;
}

export default function Game3DPropertiesPanel({
  gameState,
  onChange,
  selection,
  onSelectionChange,
}: Game3DPropertiesPanelProps) {
  const world = getWorld(gameState);
  if (!world) {
    return (
      <div className="p-3 text-xs text-muted-foreground">
        3D world is initializing…
      </div>
    );
  }

  // ─── Entity inspector ─────────────────────────────────────────────────
  if (selection.kind === "entity-3d") {
    const entity = world.entities.find((e) => e.id === selection.entityId) ?? null;
    if (!entity) {
      // Selection was deleted out from under us — snap back to canvas.
      onSelectionChange({ kind: "canvas" });
      return null;
    }
    return (
      <div className="p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Entity
          </h3>
          <button
            type="button"
            onClick={() => onSelectionChange({ kind: "canvas" })}
            className="rounded px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
          >
            Deselect
          </button>
        </div>
        <InspectorPanel
          gameState={gameState}
          selectedEntity={entity}
          onChange={onChange}
          onClearSelection={() => onSelectionChange({ kind: "canvas" })}
        />
      </div>
    );
  }

  // ─── Canvas-level settings ────────────────────────────────────────────
  return (
    <div className="space-y-4 p-3 text-xs">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Sky & ground
        </h3>
        <label className="mb-2 flex items-center gap-2">
          <span className="w-20 text-muted-foreground">Sky</span>
          <input
            type="color"
            value={world.skyColor}
            onChange={(e) => onChange(updateSkyColor(gameState, e.target.value))}
            className="h-7 w-12 cursor-pointer rounded border border-border"
          />
          <code className="text-[10px] text-muted-foreground">{world.skyColor}</code>
        </label>
        <label className="mb-2 flex items-center gap-2">
          <span className="w-20 text-muted-foreground">Ground</span>
          <input
            type="color"
            value={world.ground.color}
            onChange={(e) => onChange(updateGround(gameState, { color: e.target.value }))}
            className="h-7 w-12 cursor-pointer rounded border border-border"
          />
          <code className="text-[10px] text-muted-foreground">{world.ground.color}</code>
        </label>
        <label className="flex items-center gap-2">
          <span className="w-20 text-muted-foreground">Size (m)</span>
          <input
            type="number"
            value={world.ground.size}
            min={10}
            max={500}
            step={10}
            onChange={(e) => {
              const n = Number.parseFloat(e.target.value);
              if (Number.isFinite(n)) onChange(updateGround(gameState, { size: n }));
            }}
            className="w-20 rounded border border-border bg-background px-1 py-0.5"
          />
        </label>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Spawn point
        </h3>
        <div className="grid grid-cols-3 gap-1">
          {(["x", "y", "z"] as const).map((axis, i) => (
            <label key={axis} className="flex items-center gap-1">
              <span className="w-3 text-[10px] text-muted-foreground">{axis}</span>
              <input
                type="number"
                value={Number(world.spawn.position[i].toFixed(2))}
                step={0.5}
                onChange={(e) => {
                  const n = Number.parseFloat(e.target.value);
                  if (!Number.isFinite(n)) return;
                  const position: [number, number, number] = [...world.spawn.position];
                  position[i] = n;
                  onChange(updateSpawn(gameState, { position }));
                }}
                className="w-full rounded border border-border bg-background px-1 py-0.5 text-[11px]"
              />
            </label>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Stats
        </h3>
        <dl className="space-y-1 text-[11px]">
          <Row label="Entities" value={world.entities.length} />
          <Row label="Challenges" value={world.challenges.length} />
          <Row label="Engine" value={gameState.engine} />
        </dl>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Click a placed entity on the canvas to inspect it.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}
