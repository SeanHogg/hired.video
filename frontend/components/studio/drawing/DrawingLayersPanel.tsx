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
import type { ImageLayer, ImageState, LayerBlendMode } from "@shared/image-state";
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
  onSetBlendMode?: (layerId: string, blendMode: LayerBlendMode) => void;
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
  onSetBlendMode,
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
            onSetBlendMode={
              onSetBlendMode ? (mode) => onSetBlendMode(layer.id, mode) : undefined
            }
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
  onSetBlendMode?: (mode: LayerBlendMode) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

/** Blend-mode options the layers panel picker surfaces — matches the
 *  `LayerBlendMode` enum in `shared/image-state.ts` 1:1. Grouped
 *  visually (normal / darken family / lighten family / contrast /
 *  invert) per Photoshop convention. */
const BLEND_MODE_OPTIONS: ReadonlyArray<{ value: LayerBlendMode; label: string }> = [
  { value: "normal",      label: "Normal" },
  { value: "darken",      label: "Darken" },
  { value: "multiply",    label: "Multiply" },
  { value: "color-burn",  label: "Color Burn" },
  { value: "lighten",     label: "Lighten" },
  { value: "screen",      label: "Screen" },
  { value: "color-dodge", label: "Color Dodge" },
  { value: "overlay",     label: "Overlay" },
  { value: "soft-light",  label: "Soft Light" },
  { value: "hard-light",  label: "Hard Light" },
  { value: "difference",  label: "Difference" },
  { value: "exclusion",   label: "Exclusion" },
];

function LayerRow({
  layer,
  active,
  canDelete,
  onSelect,
  onToggleVisible,
  onDelete,
  onRename,
  onSetOpacity,
  onSetBlendMode,
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
        <div className="mt-1.5 flex flex-col gap-1.5 pl-7" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2">
            <span className="w-12 text-[10px] uppercase tracking-wide text-muted-foreground">
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
          {/* Blend-mode picker (#940 Image Phase 2). Self-gates: the
              row only renders when the caller wires `onSetBlendMode`,
              so legacy hosts without the handler keep their current
              opacity-only UX. */}
          {onSetBlendMode && (
            <div className="flex items-center gap-2">
              <span className="w-12 text-[10px] uppercase tracking-wide text-muted-foreground">
                Blend
              </span>
              <select
                value={layer.blendMode}
                onChange={(e) => onSetBlendMode(e.target.value as LayerBlendMode)}
                className="h-6 flex-1 rounded border border-border bg-background px-1 text-[11px]"
                aria-label="Blend mode"
              >
                {BLEND_MODE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
