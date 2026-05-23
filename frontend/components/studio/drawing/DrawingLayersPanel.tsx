/**
 * DrawingLayersPanel — Photoshop-shaped layer list body (top of the
 * list = top of the stack). MVP: add / delete / reorder / visibility /
 * opacity / rename / select-active.
 *
 * BODY-ONLY by design. The outer chrome (border, pill label, collapse
 * affordance) comes from `<FloatingCollapsiblePanel/>` so this panel
 * shares pill + open-state UX with the Timeline-runtime layers panel
 * (per DRY: ONE collapsible chrome, every layers surface plugs in).
 *
 * Per the standing DRY rule (`feedback_extract_on_duplication`) the
 * panel reads ImageState directly + invokes single-purpose callbacks;
 * it doesn't accept prop-drilled `canAddLayer` / `canDeleteLayer`
 * booleans the host could compute itself. The "can't delete the last
 * layer" rule lives here, in the consumer that knows the row count.
 */

import { useState } from "react";
import { ChevronUp, ChevronDown, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import type { ImageLayer, ImageState } from "@shared/image-state";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface DrawingLayersPanelProps {
  state: ImageState;
  onAddLayer: () => void;
  onDeleteLayer: (layerId: string) => void;
  onSelectLayer: (layerId: string) => void;
  onToggleVisible: (layerId: string) => void;
  onRenameLayer: (layerId: string, label: string) => void;
  onSetOpacity: (layerId: string, opacity: number) => void;
  onMoveLayer: (layerId: string, direction: "up" | "down") => void;
}

export default function DrawingLayersPanel({
  state,
  onAddLayer,
  onDeleteLayer,
  onSelectLayer,
  onToggleVisible,
  onRenameLayer,
  onSetOpacity,
  onMoveLayer,
}: DrawingLayersPanelProps) {
  // Photoshop-convention display: top of the list = top of the stack.
  // ImageState stores layers bottom-first; reverse for display only.
  const displayed = [...state.layers].reverse();
  const canDelete = state.layers.length > 1;

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-end border-b px-2 py-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onAddLayer}
              aria-label="Add layer"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Add layer</TooltipContent>
        </Tooltip>
      </div>
      <div className="flex-1 py-1">
        {displayed.map((layer) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            active={layer.id === state.activeLayerId}
            canDelete={canDelete}
            onSelect={() => onSelectLayer(layer.id)}
            onToggleVisible={() => onToggleVisible(layer.id)}
            onDelete={() => onDeleteLayer(layer.id)}
            onRename={(label) => onRenameLayer(layer.id, label)}
            onSetOpacity={(opacity) => onSetOpacity(layer.id, opacity)}
            onMoveUp={() => onMoveLayer(layer.id, "up")}
            onMoveDown={() => onMoveLayer(layer.id, "down")}
          />
        ))}
      </div>
    </div>
  );
}

interface LayerRowProps {
  layer: ImageLayer;
  active: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onToggleVisible: () => void;
  onDelete: () => void;
  onRename: (label: string) => void;
  onSetOpacity: (opacity: number) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function LayerRow({
  layer,
  active,
  canDelete,
  onSelect,
  onToggleVisible,
  onDelete,
  onRename,
  onSetOpacity,
  onMoveUp,
  onMoveDown,
}: LayerRowProps) {
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(layer.label);

  return (
    <div
      className={cn(
        "group mx-1 my-0.5 rounded border border-transparent px-2 py-1.5 transition-colors hover:bg-accent",
        active && "border-primary bg-accent",
      )}
      onClick={onSelect}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onToggleVisible();
          }}
          aria-label={layer.visible ? "Hide layer" : "Show layer"}
        >
          {layer.visible ? (
            <Eye className="h-3.5 w-3.5" />
          ) : (
            <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </Button>
        {editingName ? (
          <Input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={() => {
              if (draftName.trim()) onRename(draftName.trim());
              setEditingName(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setDraftName(layer.label);
                setEditingName(false);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            className="h-6 flex-1 text-xs"
          />
        ) : (
          <button
            type="button"
            className="flex-1 truncate text-left text-xs"
            onDoubleClick={(e) => {
              e.stopPropagation();
              setDraftName(layer.label);
              setEditingName(true);
            }}
          >
            {layer.label}
          </button>
        )}
        <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              onMoveUp();
            }}
            aria-label="Move layer up"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              onMoveDown();
            }}
            aria-label="Move layer down"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              if (canDelete) onDelete();
            }}
            disabled={!canDelete}
            aria-label="Delete layer"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {active && (
        <div className="mt-1.5 flex items-center gap-2 pl-7" onClick={(e) => e.stopPropagation()}>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Opacity
          </span>
          <Slider
            min={0}
            max={100}
            step={1}
            value={[Math.round(layer.opacity * 100)]}
            onValueChange={([next]) => onSetOpacity((next ?? 100) / 100)}
            className="flex-1"
          />
          <span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground">
            {Math.round(layer.opacity * 100)}%
          </span>
        </div>
      )}
    </div>
  );
}
