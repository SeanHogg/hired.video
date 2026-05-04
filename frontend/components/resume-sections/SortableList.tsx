// Shared drag-to-reorder wrapper for resume section editors. Wraps a list
// of items in dnd-kit's DndContext + SortableContext, exposes the per-item
// drag listeners through a context so any descendant (typically
// BaseSectionItem) can render <SortableDragHandle/> without prop-drilling.
//
// The handle self-gates: outside a SortableList it returns null, so the
// caller can render it unconditionally and let the wrapper decide.

import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DraggableAttributes,
} from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

interface DragHandleApi {
  attributes: DraggableAttributes;
  listeners: SyntheticListenerMap | undefined;
}

const DragHandleCtx = createContext<DragHandleApi | null>(null);

interface SortableListProps<T> {
  items: T[];
  getId: (item: T, index: number) => string;
  onReorder: (next: T[]) => void;
  children: (item: T, index: number) => ReactNode;
}

export function SortableList<T>({
  items,
  getId,
  onReorder,
  children,
}: SortableListProps<T>) {
  // 6px threshold lets clicks on inputs / checkboxes inside the item still
  // fire reliably before a drag activates (same setting as JobPipelineKanban).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const ids = useMemo(() => items.map((it, i) => getId(it, i)), [items, getId]);

  const handleEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(items, from, to));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {items.map((item, i) => (
          <SortableItem key={ids[i]} id={ids[i]}>
            {children(item, i)}
          </SortableItem>
        ))}
      </SortableContext>
    </DndContext>
  );
}

function SortableItem({ id, children }: { id: string; children: ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const api = useMemo<DragHandleApi>(
    () => ({ attributes, listeners }),
    [attributes, listeners],
  );
  return (
    <div ref={setNodeRef} style={style}>
      <DragHandleCtx.Provider value={api}>{children}</DragHandleCtx.Provider>
    </div>
  );
}

/** Renders a grip-icon drag handle wired to the enclosing SortableList
 *  item. Returns null outside a SortableList so callers (e.g.
 *  BaseSectionItem) can render it unconditionally. */
export function SortableDragHandle({ className }: { className?: string }) {
  const ctx = useContext(DragHandleCtx);
  if (!ctx) return null;
  return (
    <button
      type="button"
      aria-label="Drag to reorder"
      className={`cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1 -ml-1 touch-none ${className ?? ""}`}
      {...ctx.attributes}
      {...ctx.listeners}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
}
