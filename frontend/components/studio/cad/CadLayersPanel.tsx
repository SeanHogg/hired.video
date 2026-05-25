/**
 * CAD layers panel (#930 follow-on). Mirrors `<DrawingLayersPanel/>` —
 * the DRY rule says ONE layers chrome per editor; the image runtime's
 * panel is the reference shape (visible toggle + lock toggle + colour
 * + active highlight + rename). This component plugs the CAD-side
 * mutators in.
 *
 * Per the standing visibility-self-gating rule: the component renders
 * nothing when `state.layers` is empty or undefined — so legacy CAD
 * projects (created before the typed-layer aggregate landed) don't
 * crash; they just don't see a panel until they add one.
 */
import { useState } from "react";
import { Eye, EyeOff, Lock, LockOpen, Plus, Trash2 } from "lucide-react";
import type { CadLayer, CadState } from "@shared/cad-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface CadLayersPanelProps {
  state: CadState;
  onAddLayer: (layer: CadLayer) => void;
  onDeleteLayer: (name: string) => void;
  onUpdateLayer: (name: string, patch: Partial<Omit<CadLayer, "name">>) => void;
  onSelectActiveLayer: (name: string) => void;
}

export default function CadLayersPanel({
  state,
  onAddLayer,
  onDeleteLayer,
  onUpdateLayer,
  onSelectActiveLayer,
}: CadLayersPanelProps) {
  const layers = state.layers;
  // Visibility-self-gating per the DRY/visibility rules.
  if (!layers || layers.length === 0) return null;

  const canDelete = layers.length > 1;

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b px-2 py-1">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Layers
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              aria-label="Add layer"
              onClick={() => {
                const baseName = `Layer ${layers.length}`;
                onAddLayer({
                  name: baseName,
                  visible: true,
                  locked: false,
                  color: "#0a0a0a",
                });
              }}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Add layer</TooltipContent>
        </Tooltip>
      </div>
      <div className="flex-1 py-1">
        {layers.map((layer) => (
          <CadLayerRow
            key={layer.name}
            layer={layer}
            active={layer.name === state.activeLayerName}
            canDelete={canDelete}
            onClick={() => onSelectActiveLayer(layer.name)}
            onToggleVisible={() => onUpdateLayer(layer.name, { visible: !layer.visible })}
            onToggleLocked={() => onUpdateLayer(layer.name, { locked: !layer.locked })}
            onSetColor={(color) => onUpdateLayer(layer.name, { color })}
            onDelete={() => onDeleteLayer(layer.name)}
          />
        ))}
      </div>
    </div>
  );
}

interface CadLayerRowProps {
  layer: CadLayer;
  active: boolean;
  canDelete: boolean;
  onClick: () => void;
  onToggleVisible: () => void;
  onToggleLocked: () => void;
  onSetColor: (color: string) => void;
  onDelete: () => void;
}

function CadLayerRow({
  layer,
  active,
  canDelete,
  onClick,
  onToggleVisible,
  onToggleLocked,
  onSetColor,
  onDelete,
}: CadLayerRowProps) {
  const [editingColor, setEditingColor] = useState(false);

  return (
    <div
      className={cn(
        "group mx-1 my-0.5 flex items-center gap-1 rounded border border-transparent px-2 py-1 transition-colors hover:bg-accent",
        active && "border-primary bg-accent",
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        onClick={(e) => { e.stopPropagation(); onToggleVisible(); }}
        aria-label={layer.visible ? "Hide layer" : "Show layer"}
      >
        {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        onClick={(e) => { e.stopPropagation(); onToggleLocked(); }}
        aria-label={layer.locked ? "Unlock layer" : "Lock layer"}
      >
        {layer.locked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5 text-muted-foreground" />}
      </Button>
      <button
        type="button"
        className="h-4 w-4 shrink-0 rounded border border-border"
        style={{ backgroundColor: layer.color }}
        onClick={(e) => { e.stopPropagation(); setEditingColor(true); }}
        aria-label="Layer colour"
      />
      {editingColor && (
        <Input
          type="color"
          value={layer.color}
          autoFocus
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onSetColor(e.target.value)}
          onBlur={() => setEditingColor(false)}
          className="h-6 w-10 p-0"
        />
      )}
      <span className="flex-1 truncate text-xs">{layer.name}</span>
      {canDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          aria-label="Delete layer"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
