// Reusable kanban task board — drag-to-update-status columns over a list of
// tasks. Extracted from Tasks.tsx so the personal Tasks page AND the Content
// Creator → Gigs surface render the same board (DRY). Owns its own drag state;
// the consumer supplies the tasks + a status-change handler and (optionally) a
// click handler for opening a detail/edit sheet.

import { useState } from "react";
import { ProductivityItemStatus, getStatusDisplayName, type TaskUIState } from "@/types/task";
import { useTranslation } from "react-i18next";
import TaskCard from "./TaskCard";
import { KANBAN_COLUMN_ACCENT } from "./task-styles";

const DEFAULT_COLUMNS: ProductivityItemStatus[] = [
  ProductivityItemStatus.Planning,
  ProductivityItemStatus.ToDo,
  ProductivityItemStatus.InProgress,
  ProductivityItemStatus.Completed,
];

interface Props {
  tasks: TaskUIState[];
  onStatusChange: (taskId: string, status: ProductivityItemStatus) => void | Promise<void>;
  onTaskClick?: (task: TaskUIState) => void;
  /** Column set + order. Defaults to Planning / To Do / In Progress / Completed. */
  columns?: ProductivityItemStatus[];
}

export default function TaskBoard({ tasks, onStatusChange, onTaskClick, columns = DEFAULT_COLUMNS }: Props) {
  const { t } = useTranslation();
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<ProductivityItemStatus | null>(null);

  const onDragStart = (e: React.DragEvent<HTMLDivElement>, taskId: string) => {
    e.dataTransfer.setData("text/plain", taskId);
    e.dataTransfer.effectAllowed = "move";
    setDraggedTaskId(taskId);
  };

  const onDragEnd = () => {
    setDraggedTaskId(null);
    setDragOverColumn(null);
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>, column: ProductivityItemStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(column);
  };

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    const related = e.relatedTarget as Node | null;
    if (!related || !e.currentTarget.contains(related)) setDragOverColumn(null);
  };

  const onDrop = async (e: React.DragEvent<HTMLDivElement>, column: ProductivityItemStatus) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    setDraggedTaskId(null);
    setDragOverColumn(null);
    if (id) await onStatusChange(id, column);
  };

  const gridCols =
    columns.length <= 2 ? "md:grid-cols-2" : columns.length === 3 ? "md:grid-cols-3" : "md:grid-cols-4";

  return (
    <div className={`grid grid-cols-1 ${gridCols} gap-4`}>
      {columns.map((column) => {
        const accent = KANBAN_COLUMN_ACCENT[column] ?? KANBAN_COLUMN_ACCENT[1];
        const isOver = dragOverColumn === column;
        const columnTasks = tasks.filter((task) => task.status === column);
        return (
          <div
            key={column}
            data-testid={`task-column-${column}`}
            className={`rounded-lg border p-3 transition-all duration-200 ${
              isOver ? `${accent.active} border-2 scale-105` : "bg-muted/30"
            }`}
            onDragOver={(e) => onDragOver(e, column)}
            onDragLeave={onDragLeave}
            onDrop={(e) => onDrop(e, column)}
          >
            <div className={`font-semibold mb-2 flex items-center gap-2 ${isOver ? accent.text : ""}`}>
              {getStatusDisplayName(column)}
              <span className="text-xs text-muted-foreground">({columnTasks.length})</span>
              {isOver && (
                <span className={`text-xs ${accent.pill} px-2 py-1 rounded-full`}>{t("labels.dropHere")}</span>
              )}
            </div>
            <div className="space-y-2 min-h-24">
              {columnTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  dragging={draggedTaskId === task.id}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onClick={() => onTaskClick?.(task)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
