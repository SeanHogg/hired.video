/**
 * InspectorPanel — Phase 1.5 entity inspector. When an entity is
 * selected, lets the author edit position / rotation / scale / color /
 * physics kind / tag inline. Self-gates: returns null with a help
 * message when nothing is selected, per DRY (no prop-drilled `canEdit`).
 *
 * Every mutation routes through `updateEntity` (world-3d-edit.ts) so
 * the Phase-5 AI agent's tool-call path lands on the same seam.
 */

import { Trash2 } from "lucide-react";
import type {
  GameState,
  World3DEntity,
  World3DPhysicsKind,
} from "@shared/game-state";
import { deleteEntity, updateEntity } from "@/lib/studio/game/world-3d-edit";

interface InspectorPanelProps {
  gameState: GameState;
  selectedEntity: World3DEntity | null;
  onChange: (next: GameState) => void;
  onClearSelection: () => void;
}

const PHYSICS_KINDS: World3DPhysicsKind[] = [
  "static",
  "dynamic",
  "kinematic",
  "sensor",
  "none",
];

export default function InspectorPanel({
  gameState,
  selectedEntity,
  onChange,
  onClearSelection,
}: InspectorPanelProps) {
  if (!selectedEntity) {
    return (
      <div className="text-xs text-muted-foreground">
        Click an entity on the canvas to inspect + edit its properties.
      </div>
    );
  }
  const e = selectedEntity;
  const patch = (p: Partial<Omit<World3DEntity, "id">>) =>
    onChange(updateEntity(gameState, e.id, p));

  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <div className="font-mono text-muted-foreground">{e.id}</div>
        <button
          type="button"
          onClick={() => {
            onChange(deleteEntity(gameState, e.id));
            onClearSelection();
          }}
          className="flex items-center gap-1 rounded bg-rose-600 px-2 py-1 text-white hover:bg-rose-500"
          title="Delete (Del)"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      <Vec3Field
        label="Position"
        value={e.position}
        step={0.5}
        onChange={(v) => patch({ position: v })}
      />
      <Vec3Field
        label="Rotation (rad)"
        value={e.rotation}
        step={Math.PI / 12}
        onChange={(v) => patch({ rotation: v })}
      />
      <Vec3Field
        label="Scale"
        value={e.scale}
        step={0.25}
        min={0.1}
        onChange={(v) => patch({ scale: v })}
      />

      <label className="flex items-center gap-2">
        <span className="w-20 text-muted-foreground">Color</span>
        <input
          type="color"
          value={e.color}
          onChange={(ev) => patch({ color: ev.target.value })}
          className="h-7 w-12 cursor-pointer rounded border border-border"
        />
        <code className="text-[10px] text-muted-foreground">{e.color}</code>
      </label>

      <label className="flex items-center gap-2">
        <span className="w-20 text-muted-foreground">Physics</span>
        <select
          value={e.physics}
          onChange={(ev) => patch({ physics: ev.target.value as World3DPhysicsKind })}
          className="flex-1 rounded border border-border bg-background px-2 py-1"
        >
          {PHYSICS_KINDS.map((k) => (
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
          value={e.tag ?? ""}
          placeholder="e.g. coin, level-goal"
          onChange={(ev) => patch({ tag: ev.target.value || undefined })}
          className="flex-1 rounded border border-border bg-background px-2 py-1"
        />
      </label>
    </div>
  );
}

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
      <div className="mb-1 text-muted-foreground">{label}</div>
      <div className="grid grid-cols-3 gap-1">
        {["x", "y", "z"].map((axis, i) => (
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
