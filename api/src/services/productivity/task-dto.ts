// Shared task DTO mapping + completion helpers.
//
// Extracted from routes/task.ts so the personal-task route AND the gig
// marketplace's "my gig work" feed serialise `tasks` rows the same way
// (one shape → the frontend's reusable TaskBoard renders both). The legacy
// TaskDTO keeps taskType / status / dates inside the row's jsonb `metadata`
// column; `userId` doubles as createdBy + assignedTo.

import type { schema } from "../../db/index.js";

type TaskRow = typeof schema.tasks.$inferSelect;

/** ProductivityItemStatus values that mean "this task is done".
 *  Mirrors the enum in frontend/types/task.ts: Closed = 4, Completed = 6. */
export const COMPLETED_STATUSES = new Set([4, 6]);

export function isCompletedStatus(status: unknown): boolean {
  return typeof status === "number" && COMPLETED_STATUSES.has(status);
}

/** Canonical kanban column status derived from the legacy numeric status.
 *  Completed (Closed=4 / Completed=6) → "done"; everything else → "todo".
 *  Keeps the Drizzle `tasks.status` column in sync with the legacy
 *  `metadata.legacyStatus` the frontend still writes, so completion can be
 *  read off the typed column instead of jsonb metadata (gap #1001). */
export function legacyStatusToColumn(status: unknown): "todo" | "done" {
  return isCompletedStatus(status) ? "done" : "todo";
}

/** True when the canonical `tasks.status` column marks the task complete. */
export function isColumnCompleted(status: string | null | undefined): boolean {
  return status === "done";
}

export type TaskDto = {
  id: string;
  text: string;
  description?: string;
  start: string;
  end?: string;
  taskType: number;
  subTaskType?: number;
  actionToTake?: number;
  status: number;
  assignedToUserId?: string;
  createdByUserId?: string;
  creationDateTime: string;
  updateDateTime: string;
  url?: string;
  /** Gig marketplace link — present only on work items materialised from an
   *  awarded gig deliverable. Lets the Content Creator → Gigs board filter
   *  + group these without a second round-trip. */
  gigProjectId?: string;
  gigMilestoneId?: string;
};

/** Map a DB task row → legacy TaskDTO. */
export function toTaskDto(row: TaskRow): TaskDto {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    text: row.title,
    description: row.description ?? undefined,
    start: (meta.start as string) ?? new Date(row.createdAt).toISOString(),
    end: (meta.end as string) ?? undefined,
    taskType: typeof meta.taskType === "number" ? meta.taskType : 0,
    subTaskType: typeof meta.subTaskType === "number" ? meta.subTaskType : undefined,
    actionToTake: typeof meta.actionToTake === "number" ? meta.actionToTake : undefined,
    status: typeof meta.legacyStatus === "number" ? meta.legacyStatus : 1,
    assignedToUserId: row.userId,
    createdByUserId: row.userId,
    creationDateTime: new Date(row.createdAt).toISOString(),
    updateDateTime: new Date(row.updatedAt).toISOString(),
    url: typeof meta.url === "string" ? meta.url : undefined,
    gigProjectId: row.gigProjectId ?? undefined,
    gigMilestoneId: row.gigMilestoneId ?? undefined,
  };
}
