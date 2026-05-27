/**
 * Game3DPropertiesPanel — right-rail properties surface for
 * `engine === "world-3d"` projects. Same `CollapsiblePanel` shell the
 * 2D mini-game uses for [GamePropertiesPanel](../GamePropertiesPanel.tsx)
 * and the Image surface uses for `DrawingAiPromptPanel`.
 *
 * **Internal sections use the project's existing collapsible-accordion
 * primitive** — [`<InspectorSectionList>`](../../v2/inspector/InspectorSectionList.tsx)
 * — so every section opens / closes independently and persists its
 * state in localStorage. Same chrome the Video editor uses for its
 * Widget / Scene / Canvas inspectors. DRY: one accordion primitive,
 * three editor surfaces.
 *
 * Selection-aware via the shared `gameSelection`:
 *   - `entity-3d` selection → entity inspector sections (transform,
 *     appearance, physics, tag)
 *   - otherwise → canvas-level sections (sky + ground, spawn, lighting,
 *     stats)
 */

import { useMemo } from "react";
import type { GameSelection } from "../GamePropertiesPanel";
import type { GameState, World3DEntity } from "@shared/game-state";
import {
  deleteEntity,
  getWorld,
  updateEntity,
  updateGround,
  updateLighting,
  updateSkyColor,
  updateSpawn,
} from "@/lib/studio/game/world-3d-edit";
import { Trash2 } from "lucide-react";
import InspectorSectionList from "../../v2/inspector/InspectorSectionList";
import type { InspectorSection } from "../../v2/inspector/types";

interface Game3DPropertiesPanelProps {
  gameState: GameState;
  onChange: (next: GameState) => void;
  selection: GameSelection;
  onSelectionChange: (next: GameSelection) => void;
}

interface EntityCtx {
  gameState: GameState;
  entity: World3DEntity;
  onChange: (next: GameState) => void;
  onDeselect: () => void;
}

interface CanvasCtx {
  gameState: GameState;
  onChange: (next: GameState) => void;
}

const ENTITY_SECTIONS: InspectorSection<EntityCtx>[] = [
  {
    id: "transform",
    title: "Transform",
    defaultOpen: true,
    render: ({ gameState, entity, onChange }) => (
      <div className="space-y-2 text-xs">
        <Vec3Field
          label="Position"
          value={entity.position}
          step={0.5}
          onChange={(position) => onChange(updateEntity(gameState, entity.id, { position }))}
        />
        <Vec3Field
          label="Rotation (rad)"
          value={entity.rotation}
          step={Math.PI / 12}
          onChange={(rotation) => onChange(updateEntity(gameState, entity.id, { rotation }))}
        />
        <Vec3Field
          label="Scale"
          value={entity.scale}
          step={0.25}
          min={0.1}
          onChange={(scale) => onChange(updateEntity(gameState, entity.id, { scale }))}
        />
      </div>
    ),
  },
  {
    id: "appearance",
    title: "Appearance",
    defaultOpen: true,
    render: ({ gameState, entity, onChange }) => (
      <div className="space-y-2 text-xs">
        <label className="flex items-center gap-2">
          <span className="w-20 text-muted-foreground">Color</span>
          <input
            type="color"
            value={entity.color}
            onChange={(e) => onChange(updateEntity(gameState, entity.id, { color: e.target.value }))}
            className="h-7 w-12 cursor-pointer rounded border border-border"
          />
          <code className="text-[10px] text-muted-foreground">{entity.color}</code>
        </label>
        {entity.textureUrl && (
          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground">Texture</span>
            <div className="flex items-center gap-2 rounded border border-border bg-muted/40 p-1">
              <img
                src={entity.textureUrl}
                alt=""
                className="h-10 w-10 rounded border border-border object-cover"
              />
              <button
                type="button"
                onClick={() => onChange(updateEntity(gameState, entity.id, { textureUrl: undefined }))}
                className="text-[10px] text-rose-500 hover:underline"
              >
                Remove
              </button>
            </div>
          </div>
        )}
      </div>
    ),
  },
  {
    id: "physics",
    title: "Physics & gameplay",
    render: ({ gameState, entity, onChange }) => (
      <div className="space-y-2 text-xs">
        <label className="flex items-center gap-2">
          <span className="w-20 text-muted-foreground">Body</span>
          <select
            value={entity.physics}
            onChange={(e) =>
              onChange(
                updateEntity(gameState, entity.id, {
                  physics: e.target.value as World3DEntity["physics"],
                }),
              )
            }
            className="flex-1 rounded border border-border bg-background px-2 py-1"
          >
            {(["static", "dynamic", "kinematic", "sensor", "none"] as const).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="w-20 text-muted-foreground">Tag</span>
          <input
            type="text"
            value={entity.tag ?? ""}
            placeholder="coin, level-goal…"
            onChange={(e) =>
              onChange(updateEntity(gameState, entity.id, { tag: e.target.value || undefined }))
            }
            className="flex-1 rounded border border-border bg-background px-2 py-1"
          />
        </label>
      </div>
    ),
  },
  {
    id: "actions",
    title: "Actions",
    render: ({ gameState, entity, onChange, onDeselect }) => (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => {
            onChange(deleteEntity(gameState, entity.id));
            onDeselect();
          }}
          className="flex w-full items-center justify-center gap-1 rounded bg-rose-600 px-2 py-1 text-xs font-semibold text-white hover:bg-rose-500"
        >
          <Trash2 className="h-3 w-3" />
          Delete entity
        </button>
      </div>
    ),
  },
];

const CANVAS_SECTIONS: InspectorSection<CanvasCtx>[] = [
  {
    id: "sky-ground",
    title: "Sky & ground",
    defaultOpen: true,
    render: ({ gameState, onChange }) => {
      const world = getWorld(gameState);
      if (!world) return null;
      return (
        <div className="space-y-2 text-xs">
          <label className="flex items-center gap-2">
            <span className="w-20 text-muted-foreground">Sky</span>
            <input
              type="color"
              value={world.skyColor}
              onChange={(e) => onChange(updateSkyColor(gameState, e.target.value))}
              className="h-7 w-12 cursor-pointer rounded border border-border"
            />
            <code className="text-[10px] text-muted-foreground">{world.skyColor}</code>
          </label>
          <label className="flex items-center gap-2">
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
      );
    },
  },
  {
    id: "spawn",
    title: "Spawn point",
    render: ({ gameState, onChange }) => {
      const world = getWorld(gameState);
      if (!world) return null;
      return (
        <Vec3Field
          label=""
          value={world.spawn.position}
          step={0.5}
          onChange={(position) => onChange(updateSpawn(gameState, { position }))}
        />
      );
    },
  },
  {
    id: "lighting",
    title: "Lighting",
    render: ({ gameState, onChange }) => {
      const world = getWorld(gameState);
      if (!world) return null;
      return (
        <div className="space-y-2 text-xs">
          <label className="flex items-center gap-2">
            <span className="w-24 text-muted-foreground">Ambient</span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={world.lighting.ambient.intensity}
              onChange={(e) =>
                onChange(
                  updateLighting(gameState, {
                    ambient: { ...world.lighting.ambient, intensity: Number(e.target.value) },
                  }),
                )
              }
              className="flex-1"
            />
            <code className="w-10 text-right text-[10px] text-muted-foreground">
              {world.lighting.ambient.intensity.toFixed(2)}
            </code>
          </label>
          <label className="flex items-center gap-2">
            <span className="w-24 text-muted-foreground">Sun</span>
            <input
              type="range"
              min={0}
              max={3}
              step={0.05}
              value={world.lighting.sun.intensity}
              onChange={(e) =>
                onChange(
                  updateLighting(gameState, {
                    sun: { ...world.lighting.sun, intensity: Number(e.target.value) },
                  }),
                )
              }
              className="flex-1"
            />
            <code className="w-10 text-right text-[10px] text-muted-foreground">
              {world.lighting.sun.intensity.toFixed(2)}
            </code>
          </label>
        </div>
      );
    },
  },
  {
    id: "stats",
    title: "Stats",
    render: ({ gameState }) => {
      const world = getWorld(gameState);
      if (!world) return null;
      return (
        <dl className="space-y-1 text-[11px]">
          <Row label="Entities" value={world.entities.length} />
          <Row label="Challenges" value={world.challenges.length} />
          <Row label="Engine" value={gameState.engine} />
        </dl>
      );
    },
  },
];

export default function Game3DPropertiesPanel({
  gameState,
  onChange,
  selection,
  onSelectionChange,
}: Game3DPropertiesPanelProps) {
  const world = getWorld(gameState);

  const entity = useMemo<World3DEntity | null>(() => {
    if (!world || selection.kind !== "entity-3d") return null;
    return world.entities.find((e) => e.id === selection.entityId) ?? null;
  }, [world, selection]);

  if (!world) {
    return (
      <div className="p-3 text-xs text-muted-foreground">
        3D world is initializing…
      </div>
    );
  }

  // Stale selection — entity was deleted while still selected. Snap to canvas.
  if (selection.kind === "entity-3d" && !entity) {
    onSelectionChange({ kind: "canvas" });
    return null;
  }

  if (entity) {
    return (
      <InspectorSectionList
        sections={ENTITY_SECTIONS}
        ctx={{
          gameState,
          entity,
          onChange,
          onDeselect: () => onSelectionChange({ kind: "canvas" }),
        }}
        storageKey="studio.game3d.inspector.entity"
      />
    );
  }

  return (
    <InspectorSectionList
      sections={CANVAS_SECTIONS}
      ctx={{ gameState, onChange }}
      storageKey="studio.game3d.inspector.canvas"
    />
  );
}

// ─── Shared field components ──────────────────────────────────────────────

interface Vec3FieldProps {
  label: string;
  value: [number, number, number];
  step?: number;
  min?: number;
  onChange: (next: [number, number, number]) => void;
}

function Vec3Field({ label, value, step = 0.5, min, onChange }: Vec3FieldProps) {
  const update = (idx: number, raw: string) => {
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n)) return;
    const next: [number, number, number] = [...value];
    next[idx] = n;
    onChange(next);
  };
  return (
    <div>
      {label && <div className="mb-1 text-[10px] text-muted-foreground">{label}</div>}
      <div className="grid grid-cols-3 gap-1">
        {(["x", "y", "z"] as const).map((axis, i) => (
          <label key={axis} className="flex items-center gap-1">
            <span className="w-3 text-[10px] text-muted-foreground">{axis}</span>
            <input
              type="number"
              value={Number(value[i].toFixed(3))}
              step={step}
              min={min}
              onChange={(ev) => update(i, ev.target.value)}
              className="w-full rounded border border-border bg-background px-1 py-0.5 text-[11px]"
            />
          </label>
        ))}
      </div>
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
