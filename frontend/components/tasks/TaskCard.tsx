// Reusable draggable task card — the kanban cell shared by the Tasks page and
// the Content Creator → Gigs board. Presentational: drag wiring + click are
// passed in by the board.

import { Badge } from "@/components/ui/badge";
import { getTaskTypeDisplayName, type TaskUIState } from "@/types/task";
import { taskTypeColors, priorityColors } from "./task-styles";

interface Props {
  task: TaskUIState;
  dragging: boolean;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, taskId: string) => void;
  onDragEnd: (e: React.DragEvent<HTMLDivElement>) => void;
  onClick: (task: TaskUIState) => void;
}

export default function TaskCard({ task, dragging, onDragStart, onDragEnd, onClick }: Props) {
  return (
    <div
      className={`rounded-md border bg-card p-3 cursor-grab active:cursor-grabbing transition-all duration-200 ${
        dragging ? "opacity-50 transform rotate-2 scale-105 shadow-2xl" : "hover:shadow-md hover:scale-102"
      }`}
      draggable
      onDragStart={(e) => onDragStart(e, task.id)}
      onDragEnd={onDragEnd}
      onClick={() => onClick(task)}
      role="button"
      tabIndex={0}
    >
      <div className="text-sm font-medium">{task.title}</div>
      {task.description && (
        <div className="text-xs text-muted-foreground mt-1">
          {task.description.length > 60 ? `${task.description.substring(0, 60)}...` : task.description}
        </div>
      )}
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <Badge className={taskTypeColors[task.type]}>{getTaskTypeDisplayName(task.type)}</Badge>
        <Badge className={priorityColors[task.priority]}>{task.priority}</Badge>
      </div>
    </div>
  );
}
