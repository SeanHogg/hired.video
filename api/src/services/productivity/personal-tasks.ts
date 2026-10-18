// Personal task use cases (routes/task.ts): list / get / delete and the
// legacy upsert shared by POST /api/task/save and POST /api/task/:id.

import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import {
  PersonalTasksRepository,
  type IPersonalTasksRepository,
  type PersonalTaskRow,
} from "../../repositories/personalTasksRepository.js";
import { getOrCreateDefaultBoard } from "./default-board.js";
import {
  isColumnCompleted,
  isCompletedStatus,
  legacyStatusToColumn,
  toTaskDto,
  type TaskDto,
} from "./task-dto.js";

/** Fires the task-closed gamification event; returns the unlocked badges.
 *  The route supplies it (it needs the request's JWT role). */
export type TaskClosedAward = (
  label: "task-close" | "task-create-closed",
  taskId: string,
  taskType: number,
) => Promise<string[]>;

export type SavedTaskDto = TaskDto & { badgesUnlocked?: string[] };

function repo(): IPersonalTasksRepository {
  return new PersonalTasksRepository(getDb());
}

/** Serialise a task row, attaching `badgesUnlocked` only when the save
 *  unlocked at least one badge so the client can refresh immediately
 *  instead of waiting for the 60s poll (#1135). */
function taskWithBadges(row: PersonalTaskRow, badgesUnlocked: string[]): SavedTaskDto {
  const dto = toTaskDto(row);
  return badgesUnlocked.length > 0 ? { ...dto, badgesUnlocked } : dto;
}

export async function listPersonalTasks(userId: string): Promise<TaskDto[]> {
  // segment_id IS NULL → personal kanban only; CHRO action items
  // (segment-scoped) live in /api/people/* and must not leak here.
  return (await repo().listForUser(userId)).map(toTaskDto);
}

export async function getPersonalTask(userId: string, id: string): Promise<TaskDto> {
  const row = await repo().findForUser(id, userId);
  if (!row) throw new DomainError(404, "NOT_FOUND", "Task not found");
  return toTaskDto(row);
}

export async function deletePersonalTask(userId: string, id: string): Promise<void> {
  await repo().deleteForUser(id, userId);
}

/** Store legacy-specific fields plus any caller-supplied free-form
 *  metadata in the row's jsonb metadata column. Career 360's
 *  "Add to Tasks" flow rides on this — it stuffs the source gap /
 *  step id under `metadata.career360` so the Tasks page can later
 *  validate completion against the master resume (e.g. confirm a
 *  PSPO cert appears in the resume's certificates list). */
function legacyMetadata(body: Record<string, unknown>): Record<string, unknown> {
  const extra = (body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata))
    ? (body.metadata as Record<string, unknown>)
    : {};
  return {
    ...extra,
    start: body.start,
    end: body.end,
    taskType: body.taskType,
    subTaskType: body.subTaskType,
    actionToTake: body.actionToTake,
    legacyStatus: body.status,
  };
}

/** Legacy TaskDTO upsert: update the caller's personal task `id` when it
 *  exists, otherwise create it (with `id` when supplied) on the default
 *  board. Fires the task-closed award on the not-completed → completed edge. */
export async function savePersonalTask(
  userId: string,
  id: string | null,
  body: Record<string, unknown>,
  award: TaskClosedAward,
): Promise<SavedTaskDto> {
  const tasks = repo();
  const metadata = legacyMetadata(body);
  const text = typeof body.text === "string" && body.text.length > 0 ? body.text : null;

  const existing = id ? await tasks.findForUser(id, userId) : null;
  if (existing) {
    const existingMeta = (existing.metadata as Record<string, unknown> | null) ?? {};
    const mergedMeta = { ...existingMeta, ...metadata };
    const nextStatus = legacyStatusToColumn(mergedMeta.legacyStatus);
    // #1001 — completion is now read off the canonical `status` column.
    // `wasCompleted` also honours the legacy metadata so a row written
    // before this migration (column still default "todo" but metadata
    // says completed) is treated as already-complete → no award re-fire.
    const wasCompleted =
      isColumnCompleted(existing.status) || isCompletedStatus(existingMeta.legacyStatus);
    const nowCompleted = isColumnCompleted(nextStatus);

    const updated = await tasks.update(existing.id, {
      title: text ?? existing.title,
      description: typeof body.description === "string" ? body.description : existing.description,
      metadata: mergedMeta,
      status: nextStatus,
      completedAt: nowCompleted ? (existing.completedAt ?? new Date()) : null,
      updatedAt: new Date(),
    });

    let badgesUnlocked: string[] = [];
    if (!wasCompleted && nowCompleted) {
      const taskType = typeof metadata.taskType === "number"
        ? metadata.taskType
        : typeof existingMeta.taskType === "number" ? existingMeta.taskType : 0;
      badgesUnlocked = await award("task-close", updated.id, taskType);
    }
    return taskWithBadges(updated, badgesUnlocked);
  }

  const boardId = await getOrCreateDefaultBoard(userId, getDb());
  const createdCompleted = isCompletedStatus(metadata.legacyStatus);
  const created = await tasks.insert({
    id: id ?? undefined,
    boardId,
    userId,
    title: text ?? "Task",
    description: typeof body.description === "string" ? body.description : null,
    metadata,
    status: legacyStatusToColumn(metadata.legacyStatus),
    completedAt: createdCompleted ? new Date() : null,
  });

  // First-write-already-completed (rare but valid: e.g. importing
  // historic completed tasks). Treat as a completion event.
  let createdBadges: string[] = [];
  if (createdCompleted) {
    const taskType = typeof metadata.taskType === "number" ? metadata.taskType : 0;
    createdBadges = await award("task-create-closed", created.id, taskType);
  }
  return taskWithBadges(created, createdBadges);
}
