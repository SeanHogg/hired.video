// KanbanColumn — a single droppable swimlane on the recruiter pipeline.
// Renders a draggable card per entry; the parent supplies handlers and
// selection state.

import { ChevronDown, ChevronRight } from "lucide-react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  PIPELINE_STAGE_LABELS,
  type PipelineStage,
} from "@shared/recruiter-pipeline";
import type {
  PipelineEntry,
  PipelineStageGroup,
} from "@/lib/services/job-pipeline-service";
import JobPipelineCard from "@/components/recruit/JobPipelineCard";

interface KanbanColumnProps {
  group: PipelineStageGroup;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onMoveStage: (id: string, next: PipelineStage) => void;
  onRemove: (id: string) => void;
}

export default function KanbanColumn({
  group,
  collapsed,
  onToggleCollapsed,
  selected,
  onToggleSelect,
  onMoveStage,
  onRemove,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: group.stage });

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="flex flex-col items-center gap-2 px-2 py-3 border rounded-lg bg-card hover:bg-muted/50 min-w-[44px]"
        title={`Expand ${PIPELINE_STAGE_LABELS[group.stage]}`}
      >
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-medium [writing-mode:vertical-rl]">
          {PIPELINE_STAGE_LABELS[group.stage]} ({group.count})
        </span>
      </button>
    );
  }

  return (
    <div className="flex-shrink-0 w-[300px]">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="flex items-center gap-1 font-semibold text-sm hover:text-primary"
        >
          <ChevronDown className="w-4 h-4" />
          {PIPELINE_STAGE_LABELS[group.stage]}{" "}
          <span className="text-muted-foreground">({group.count})</span>
        </button>
      </div>
      <div
        ref={setNodeRef}
        className={`space-y-2 max-h-[70vh] overflow-y-auto pr-1 rounded transition-colors ${
          isOver ? "bg-primary/10 ring-2 ring-primary ring-offset-2" : ""
        }`}
      >
        {group.entries.map((entry) => (
          <DraggableCard
            key={entry.id}
            entry={entry}
            selected={selected.has(entry.id)}
            onToggleSelect={onToggleSelect}
            onMoveStage={onMoveStage}
            onRemove={onRemove}
          />
        ))}
        {group.entries.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-6 border border-dashed rounded">
            Empty
          </div>
        )}
      </div>
    </div>
  );
}

interface DraggableCardProps {
  entry: PipelineEntry;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onMoveStage: (id: string, next: PipelineStage) => void;
  onRemove: (id: string) => void;
}

function DraggableCard({
  entry,
  selected,
  onToggleSelect,
  onMoveStage,
  onRemove,
}: DraggableCardProps) {
  const { setNodeRef, attributes, listeners, transform, isDragging } = useDraggable({ id: entry.id });
  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <JobPipelineCard
        entry={entry}
        selected={selected}
        onToggleSelect={onToggleSelect}
        onMoveStage={onMoveStage}
        onRemove={onRemove}
      />
    </div>
  );
}
