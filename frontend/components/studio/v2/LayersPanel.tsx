/**
 * LayersPanel — flat list of widgets on the active scene, ordered
 * front-to-back (top of list = highest z = front-most), Figma-style.
 *
 * Click selects the widget, drag-handle reorders via @dnd-kit (matching
 * ScenesRail's pattern), the per-row chevrons nudge a single layer up
 * or down. Per-scene by design: each scene owns its own widget pool.
 *
 * Self-gating per DRY: receives only the active scene's widgets +
 * selection, and emits a single `onReorderLayers(widgetIds)` callback
 * carrying the new front-to-back order. The host renumbers every
 * widget's `position.z` so this panel and any future consumer
 * (inspector "Bring forward" buttons, keyboard shortcuts) route
 * through the same seam.
 */
import { useMemo, type ComponentType } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronUp,
  ChevronDown,
  GripVertical,
  Layers,
  Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type {
  Scene,
  Widget,
  WidgetKind,
} from "@/lib/studio/editor-v2/canvas-state";
import { WIDGET_TITLES } from "./inspector/widget-sections";
import { WIDGET_CATALOG } from "./WidgetPalette";

export interface LayersPanelProps {
  scene: Scene;
  selectedWidgetId: string | null;
  onSelectWidget: (widgetId: string) => void;
  /** Reorder front-to-back: `widgetIds[0]` ends up with the highest
   *  `position.z`, `widgetIds[last]` with z 0. Single seam — the host
   *  renumbers every widget so the panel never has to track ties. */
  onReorderLayers: (widgetIds: string[]) => void;
}

const ICON_BY_KIND: Partial<
  Record<WidgetKind, ComponentType<{ className?: string }>>
> = (() => {
  const map: Partial<
    Record<WidgetKind, ComponentType<{ className?: string }>>
  > = {};
  for (const item of WIDGET_CATALOG) map[item.kind] = item.icon;
  return map;
})();

function iconForKind(kind: WidgetKind): ComponentType<{ className?: string }> {
  return ICON_BY_KIND[kind] ?? Link2;
}

function labelForWidget(widget: Widget): string {
  const fallback = WIDGET_TITLES[widget.kind];
  switch (widget.params.kind) {
    case "text":
    case "heading": {
      const snippet = widget.params.data.text.trim();
      return snippet.length > 0 ? snippet.slice(0, 48) : fallback;
    }
    case "chips": {
      const chips = widget.params.data.chips;
      if (chips.length === 0) return fallback;
      const joined = chips.slice(0, 3).join(", ");
      return chips.length > 3 ? `${joined}, …` : joined;
    }
    case "cta": {
      const headline = widget.params.data.headline?.trim();
      return headline && headline.length > 0 ? headline : fallback;
    }
    default:
      return fallback;
  }
}

/** Sort widgets front-to-back. Higher z first; insertion order is the
 *  tiebreaker (later-added on top) so the panel renders deterministically
 *  even when freshly-added widgets all start at the same default z. */
function widgetsFrontToBack(widgets: Widget[]): Widget[] {
  return widgets
    .map((w, i) => ({ w, i }))
    .sort((a, b) => {
      const diff = b.w.position.z - a.w.position.z;
      if (diff !== 0) return diff;
      return b.i - a.i;
    })
    .map(({ w }) => w);
}

export default function LayersPanel({
  scene,
  selectedWidgetId,
  onSelectWidget,
  onReorderLayers,
}: LayersPanelProps) {
  const ordered = useMemo(
    () => widgetsFrontToBack(scene.widgets),
    [scene.widgets],
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = ordered.map((w) => w.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorderLayers(arrayMove(ids, from, to));
  }

  function moveBy(widgetId: string, delta: -1 | 1) {
    const ids = ordered.map((w) => w.id);
    const idx = ids.indexOf(widgetId);
    const next = idx + delta;
    if (idx < 0 || next < 0 || next >= ids.length) return;
    onReorderLayers(arrayMove(ids, idx, next));
  }

  if (ordered.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
        <Layers className="h-5 w-5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          No layers in this scene yet.
        </p>
        <p className="text-[11px] text-muted-foreground/80">
          Add widgets from the Widgets tab — each one becomes a layer
          you can reorder.
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex h-full flex-col overflow-y-auto"
      style={{ scrollbarGutter: "stable" }}
    >
      <div className="border-b border-border px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Top = front
        </p>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={ordered.map((w) => w.id)}
          strategy={verticalListSortingStrategy}
        >
          <ol className="flex flex-col gap-1 px-2 py-2">
            {ordered.map((widget, index) => (
              <LayerRow
                key={widget.id}
                widget={widget}
                selected={widget.id === selectedWidgetId}
                isFirst={index === 0}
                isLast={index === ordered.length - 1}
                onSelect={() => onSelectWidget(widget.id)}
                onMoveUp={() => moveBy(widget.id, -1)}
                onMoveDown={() => moveBy(widget.id, 1)}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
    </div>
  );
}

interface LayerRowProps {
  widget: Widget;
  selected: boolean;
  isFirst: boolean;
  isLast: boolean;
  onSelect: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function LayerRow({
  widget,
  selected,
  isFirst,
  isLast,
  onSelect,
  onMoveUp,
  onMoveDown,
}: LayerRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id });
  const Icon = iconForKind(widget.kind);
  const label = labelForWidget(widget);
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li ref={setNodeRef} style={style}>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-md border bg-card text-left transition",
          selected
            ? "border-brand-purple ring-2 ring-brand-purple/30"
            : "border-border hover:border-foreground/30",
        )}
      >
        <span
          className="flex w-5 shrink-0 cursor-grab select-none items-center justify-center text-muted-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder layer"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-1 text-left"
        >
          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-[11px] leading-tight">{label}</span>
        </button>
        <div className="flex shrink-0 items-center gap-0.5 pr-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
          <Button
            size="icon"
            variant="ghost"
            disabled={isFirst}
            onClick={(e) => {
              e.stopPropagation();
              onMoveUp();
            }}
            aria-label="Bring forward"
            className="h-6 w-6"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            disabled={isLast}
            onClick={(e) => {
              e.stopPropagation();
              onMoveDown();
            }}
            aria-label="Send backward"
            className="h-6 w-6"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </li>
  );
}
