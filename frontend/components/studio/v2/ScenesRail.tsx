/**
 * Scene thumbnail rail — PowerPoint-style vertical list of scenes on
 * the left side of the v2 editor. Click a scene to focus it on the
 * canvas; click the + button to append a new scene; drag to reorder.
 *
 * Self-gating per DRY: receives the full canvas state via context-bound
 * props from the editor shell; doesn't get prop-drilled "can edit"
 * booleans — it just calls the mutator hooks the shell provides.
 */
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
import { Plus, GripVertical, StickyNote } from "lucide-react";
import type { Scene } from "@/lib/studio/editor-v2/canvas-state";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import SceneThumbnail from "@/components/studio/shared/SceneThumbnail";
import SceneActionButtons from "./SceneActionButtons";

export interface ScenesRailProps {
  scenes: Scene[];
  activeSceneId: string | null;
  onSelect: (sceneId: string) => void;
  onAdd: () => void;
  onDelete: (sceneId: string) => void;
  onDuplicate: (sceneId: string) => void;
  onReorder: (nextOrderIds: string[]) => void;
}

export default function ScenesRail({
  scenes,
  activeSceneId,
  onSelect,
  onAdd,
  onDelete,
  onDuplicate,
  onReorder,
}: ScenesRailProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = scenes.map((s) => s.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(ids, from, to));
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Scenes
        </h3>
        <Button
          size="sm"
          variant="ghost"
          onClick={onAdd}
          className="h-7 gap-1 px-2 text-xs"
          aria-label="Add scene"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>
      <div
        className="flex-1 overflow-y-auto px-2 py-2"
        style={{ scrollbarGutter: "stable" }}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={scenes.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <ol className="flex flex-col gap-2">
              {scenes.map((scene, idx) => (
                <SceneThumb
                  key={scene.id}
                  scene={scene}
                  index={idx}
                  active={scene.id === activeSceneId}
                  sceneCount={scenes.length}
                  onSelect={() => onSelect(scene.id)}
                  onDelete={onDelete}
                  onDuplicate={onDuplicate}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}

interface SceneThumbProps {
  scene: Scene;
  index: number;
  active: boolean;
  sceneCount: number;
  onSelect: () => void;
  onDelete: (sceneId: string) => void;
  onDuplicate: (sceneId: string) => void;
}

function SceneThumb({
  scene,
  index,
  active,
  sceneCount,
  onSelect,
  onDelete,
  onDuplicate,
}: SceneThumbProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: scene.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li ref={setNodeRef} style={style}>
      <div
        className={cn(
          "group relative flex w-full items-stretch gap-2 rounded-md border bg-card text-left transition",
          active
            ? "border-brand-purple ring-2 ring-brand-purple/30"
            : "border-border hover:border-foreground/30",
        )}
      >
        <span
          className="flex w-6 select-none items-center justify-center text-[10px] font-medium text-muted-foreground"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
        <button
          type="button"
          onClick={onSelect}
          className="flex-1 py-2 pr-2 text-left"
        >
          <div className="aspect-video w-full overflow-hidden rounded border border-border">
            <SceneThumbnail scene={scene} />
          </div>
          <p className="mt-1 flex items-center gap-1 truncate text-[11px] font-medium">
            {index + 1}. {scene.label}
            <SceneNotesBadge notes={scene.directorNotes} />
          </p>
          <p className="text-[10px] text-muted-foreground">
            {scene.durationSeconds.toFixed(1)}s · {scene.widgets.length} widget
            {scene.widgets.length === 1 ? "" : "s"}
          </p>
        </button>
        <SceneActionButtons
          sceneId={scene.id}
          sceneLabel={scene.label}
          sceneCount={sceneCount}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          size="compact"
          className="absolute right-1 top-1 hidden rounded bg-card/80 p-0.5 backdrop-blur group-hover:flex"
        />
      </div>
    </li>
  );
}

/** Indicator chip surfaced on each scene thumbnail when the director
 *  has attached notes — same shared component pattern the rest of the
 *  rail uses. Self-gates per DRY: returns null when notes are empty
 *  so consumers don't gate visibility themselves. Hover surfaces the
 *  notes preview via the native title tooltip — light-weight, no
 *  separate hover-card dependency. */
function SceneNotesBadge({ notes }: { notes: string | null | undefined }) {
  if (!notes) return null;
  return (
    <span
      title={notes}
      aria-label="Scene has director's notes"
      className="inline-flex"
    >
      <StickyNote className="h-3 w-3 shrink-0 text-amber-500" />
    </span>
  );
}

