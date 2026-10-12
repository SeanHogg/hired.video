/**
 * UnitsRail — the single, generic left-rail navigator for every studio
 * kind that authors an ORDERED LIST of units: Scenes (video / podcast /
 * voice / comic), Levels (game), Frames (animation). PowerPoint-style
 * vertical list: click a card to focus it on the canvas, drag to
 * reorder, header `+` to append, hover a card for Duplicate / Delete.
 *
 * WHY THIS EXISTS — `ScenesRail` and `LevelsRail` were near-identical
 * dnd-kit sortable lists that drifted (Scenes had Duplicate; Levels
 * didn't), and animation grew a THIRD copy embedded in the canvas
 * instead of a left rail at all. Per the standing DRY rule
 * (`feedback_extract_on_duplication`) the sortable list + active ring +
 * drag handle + Add header + Duplicate/Delete cluster live HERE once;
 * each kind contributes only its card BODY via `renderBody` and its
 * mutation callbacks. Adding a new kind's rail = a thin wrapper, not a
 * fourth copy of the dnd-kit plumbing.
 *
 * The rail is generic over the unit type `T`; the host maps its own
 * model (Scene / GameLevel / AnimationFrame) through `getId` + `getLabel`
 * + `renderBody`. The rail never reaches into a kind-specific shape.
 */
import type { ReactNode } from "react";
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
import { GripVertical, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import UnitActionButtons from "./UnitActionButtons";

export interface UnitsRailProps<T> {
  /** Section heading, e.g. "Scenes" / "Levels" / "Frames". */
  title: string;
  /** Lower-case singular noun for aria / tooltips, e.g. "scene". */
  unitNoun: string;
  units: T[];
  getId: (unit: T) => string;
  /** Human label for a unit (aria + action-button titles). Defaults to
   *  `"${capitalised noun} ${index + 1}"` when omitted. */
  getLabel?: (unit: T, index: number) => string;
  activeId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  /** Omit for kinds whose unit model has no copy semantics. */
  onDuplicate?: (id: string) => void;
  onReorder: (nextOrderIds: string[]) => void;
  /** Renders the card body (everything between the drag handle and the
   *  hover action cluster). The body owns its own click→select wiring
   *  via the supplied `onSelect`. */
  renderBody: (args: {
    unit: T;
    index: number;
    active: boolean;
    onSelect: () => void;
  }) => ReactNode;
}

export default function UnitsRail<T>({
  title,
  unitNoun,
  units,
  getId,
  getLabel,
  activeId,
  onSelect,
  onAdd,
  onDelete,
  onDuplicate,
  onReorder,
  renderBody,
}: UnitsRailProps<T>) {
  const { t } = useTranslation();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = units.map(getId);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(ids, from, to));
  }

  const labelFor = (unit: T, index: number) =>
    getLabel?.(unit, index) ??
    `${unitNoun.charAt(0).toUpperCase()}${unitNoun.slice(1)} ${index + 1}`;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3.5 pb-1.5 pt-3">
        <h3 className="font-mono text-[11px] font-normal uppercase tracking-[0.08em] text-muted-foreground">
          {title} · {units.length}
        </h3>
        <Button
          size="sm"
          variant="outline"
          onClick={onAdd}
          className="h-8 gap-1 rounded-lg px-2.5 text-[13px] font-semibold"
          aria-label={t("studio.rail.addUnit", { noun: unitNoun })}
        >
          <Plus className="h-3.5 w-3.5" />
          {t("actions.add")}
        </Button>
      </div>
      <div
        className="flex-1 overflow-y-auto px-3.5 py-2"
        style={{ scrollbarGutter: "stable" }}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={units.map(getId)}
            strategy={verticalListSortingStrategy}
          >
            <ol className="flex flex-col gap-2.5">
              {units.map((unit, idx) => {
                const id = getId(unit);
                return (
                  <SortableUnit
                    key={id}
                    id={id}
                    label={labelFor(unit, idx)}
                    unitNoun={unitNoun}
                    active={id === activeId}
                    count={units.length}
                    onDelete={onDelete}
                    onDuplicate={onDuplicate}
                  >
                    {renderBody({
                      unit,
                      index: idx,
                      active: id === activeId,
                      onSelect: () => onSelect(id),
                    })}
                  </SortableUnit>
                );
              })}
            </ol>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}

interface SortableUnitProps {
  id: string;
  label: string;
  unitNoun: string;
  active: boolean;
  count: number;
  onDelete: (id: string) => void;
  onDuplicate?: (id: string) => void;
  children: ReactNode;
}

function SortableUnit({
  id,
  label,
  unitNoun,
  active,
  count,
  onDelete,
  onDuplicate,
  children,
}: SortableUnitProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li ref={setNodeRef} style={style}>
      <div
        className={cn(
          "group relative flex w-full items-stretch rounded-xl border bg-card text-left transition",
          active
            ? "border-primary ring-1 ring-primary"
            : "border-border hover:border-input",
        )}
      >
        <span
          className="flex w-4 shrink-0 select-none items-center justify-center text-muted-foreground opacity-0 transition-opacity cursor-grab active:cursor-grabbing group-hover:opacity-100 focus-visible:opacity-100"
          {...attributes}
          {...listeners}
          aria-label={t("studio.rail.dragToReorder")}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">{children}</div>
        <UnitActionButtons
          unitId={id}
          unitLabel={label}
          unitNoun={unitNoun}
          count={count}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          size="compact"
          className="absolute right-1.5 top-1.5 hidden rounded-lg border border-border bg-card/90 p-0.5 backdrop-blur group-hover:flex"
        />
      </div>
    </li>
  );
}
