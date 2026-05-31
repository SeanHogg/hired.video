import { Hono } from "hono";
import { eq, and, desc, isNull } from "drizzle-orm";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { withGamification } from "../domains/gamification/with-gamification.js";

const { boards, tasks } = schema;

export const taskRoutes = new Hono<AppEnv>();

function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}

/** ProductivityItemStatus values that mean "this task is done".
 *  Mirrors the enum in frontend/types/task.ts:
 *    Closed = 4, Completed = 6. */
const COMPLETED_STATUSES = new Set([4, 6]);

function isCompletedStatus(status: unknown): boolean {
  return typeof status === "number" && COMPLETED_STATUSES.has(status);
}

type TaskDto = {
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
};

/** Map DB task row → legacy TaskDTO */
function toTaskDto(row: typeof tasks.$inferSelect): TaskDto {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    text: row.title,
    description: row.description ?? undefined,
    start: meta.start as string ?? new Date(row.createdAt).toISOString(),
    end: meta.end as string ?? undefined,
    taskType: typeof meta.taskType === "number" ? meta.taskType : 0,
    subTaskType: typeof meta.subTaskType === "number" ? meta.subTaskType : undefined,
    actionToTake: typeof meta.actionToTake === "number" ? meta.actionToTake : undefined,
    status: typeof meta.legacyStatus === "number" ? meta.legacyStatus : 1,
    assignedToUserId: row.userId,
    createdByUserId: row.userId,
    creationDateTime: new Date(row.createdAt).toISOString(),
    updateDateTime: new Date(row.updatedAt).toISOString(),
    url: typeof meta.url === "string" ? meta.url : undefined,
  };
}

/** Ensure a default "tasks" board exists for the user; returns its id */
async function getOrCreateDefaultBoard(userId: string, db: ReturnType<typeof getDb>): Promise<string> {
  const [existing] = await db
    .select({ id: boards.id })
    .from(boards)
    .where(and(eq(boards.userId, userId), eq(boards.name, "__default__")))
    .limit(1);

  if (existing) return existing.id;

  const [created] = await db
    .insert(boards)
    .values({ userId, name: "__default__", description: "Default task board" } as any)
    .returning({ id: boards.id });

  return created.id;
}

taskRoutes.get("/", async (c) => {
  const userId = c.var.user.sub;
  const db = getDb();
  const rows = await db
    .select()
    .from(tasks)
    // segment_id IS NULL → personal kanban only; CHRO action items
    // (segment-scoped) live in /api/people/* and must not leak here.
    .where(and(eq(tasks.userId, userId), isNull(tasks.segmentId)))
    .orderBy(desc(tasks.createdAt));
  return c.json(ok(rows.map(toTaskDto)), 200);
});

taskRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const userId = c.var.user.sub;
  const db = getDb();

  const [row] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId), isNull(tasks.segmentId)))
    .limit(1);

  if (!row) return c.json(error("NOT_FOUND", "Task not found"), 404);
  return c.json(ok(toTaskDto(row)), 200);
});

taskRoutes.post("/save", async (c) => {
  const userId = c.var.user.sub;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const db = getDb();

  const existingId = typeof body.id === "string" && body.id.length > 0 ? body.id : null;

  // Store legacy-specific fields plus any caller-supplied free-form
  // metadata in the row's jsonb metadata column. Career 360's
  // "Add to Tasks" flow rides on this — it stuffs the source gap /
  // step id under `metadata.career360` so the Tasks page can later
  // validate completion against the master resume (e.g. confirm a
  // PSPO cert appears in the resume's certificates list).
  const extra = (body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata))
    ? (body.metadata as Record<string, unknown>)
    : {};
  const metadata = {
    ...extra,
    start: body.start,
    end: body.end,
    taskType: body.taskType,
    subTaskType: body.subTaskType,
    actionToTake: body.actionToTake,
    legacyStatus: body.status,
  };

  if (existingId) {
    const [existing] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, existingId), eq(tasks.userId, userId), isNull(tasks.segmentId)))
      .limit(1);

    if (existing) {
      const existingMeta = (existing.metadata as Record<string, unknown> | null) ?? {};
      const wasCompleted = isCompletedStatus(existingMeta.legacyStatus);
      const nowCompleted = isCompletedStatus(metadata.legacyStatus);

      const [updated] = await db
        .update(tasks)
        .set({
          title: typeof body.text === "string" && body.text.length > 0 ? body.text : existing.title,
          description: typeof body.description === "string" ? body.description : existing.description,
          metadata: { ...(existingMeta as object), ...metadata },
          updatedAt: new Date(),
        } as any)
        .where(eq(tasks.id, existingId))
        .returning();

      if (!wasCompleted && nowCompleted) {
        const taskType = typeof metadata.taskType === "number"
          ? metadata.taskType
          : typeof existingMeta.taskType === "number" ? existingMeta.taskType : 0;
        await withGamification(c, "task-close", (game, role, uid) =>
          game.onTaskClosed({ userId: uid, role, taskId: updated.id, taskType }),
        );
      }

      return c.json(ok(toTaskDto(updated)), 200);
    }
  }

  const boardId = await getOrCreateDefaultBoard(userId, db);
  const [created] = await db
    .insert(tasks)
    .values({
      id: existingId ?? undefined,
      boardId,
      userId,
      title: typeof body.text === "string" && body.text.length > 0 ? body.text : "Task",
      description: typeof body.description === "string" ? body.description : null,
      metadata,
    } as any)
    .returning();

  // First-write-already-completed (rare but valid: e.g. importing
  // historic completed tasks). Treat as a completion event.
  if (isCompletedStatus(metadata.legacyStatus)) {
    const taskType = typeof metadata.taskType === "number" ? metadata.taskType : 0;
    await withGamification(c, "task-create-closed", (game, role, uid) =>
      game.onTaskClosed({ userId: uid, role, taskId: created.id, taskType }),
    );
  }

  return c.json(ok(toTaskDto(created)), 200);
});

taskRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const userId = c.var.user.sub;
  const db = getDb();

  await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId), isNull(tasks.segmentId)));
  return c.json(ok(true), 200);
});

// Legacy contract: POST /api/task/:id used for update-or-delete
taskRoutes.post("/:id", async (c) => {
  const id = c.req.param("id");
  const userId = c.var.user.sub;
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  const db = getDb();

  if (!body) {
    await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId), isNull(tasks.segmentId)));
    return c.json(ok(true), 200);
  }

  const [existing] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId), isNull(tasks.segmentId)))
    .limit(1);

  // Same `metadata` passthrough as POST /save — keeps the Career 360
  // back-reference (and any future caller-supplied metadata) on
  // round-trip updates instead of getting clobbered by the partial
  // legacy-field set.
  const extra = (body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata))
    ? (body.metadata as Record<string, unknown>)
    : {};
  const metadata = {
    ...extra,
    start: body.start,
    end: body.end,
    taskType: body.taskType,
    subTaskType: body.subTaskType,
    actionToTake: body.actionToTake,
    legacyStatus: body.status,
  };

  if (existing) {
    const existingMeta = (existing.metadata as Record<string, unknown> | null) ?? {};
    const wasCompleted = isCompletedStatus(existingMeta.legacyStatus);
    const nowCompleted = isCompletedStatus(metadata.legacyStatus);

    const [updated] = await db
      .update(tasks)
      .set({
        title: typeof body.text === "string" && body.text.length > 0 ? body.text : existing.title,
        description: typeof body.description === "string" ? body.description : existing.description,
        metadata: { ...(existingMeta as object), ...metadata },
        updatedAt: new Date(),
      } as any)
      .where(eq(tasks.id, id))
      .returning();

    if (!wasCompleted && nowCompleted) {
      const taskType = typeof metadata.taskType === "number"
        ? metadata.taskType
        : typeof existingMeta.taskType === "number" ? existingMeta.taskType : 0;
      await withGamification(c, "task-close", (game, role, uid) =>
        game.onTaskClosed({ userId: uid, role, taskId: updated.id, taskType }),
      );
    }

    return c.json(ok(toTaskDto(updated)), 200);
  }

  const boardId = await getOrCreateDefaultBoard(userId, db);
  const [created] = await db
    .insert(tasks)
    .values({
      id,
      boardId,
      userId,
      title: typeof body.text === "string" && body.text.length > 0 ? body.text : "Task",
      description: typeof body.description === "string" ? body.description : null,
      metadata,
    } as any)
    .returning();

  if (isCompletedStatus(metadata.legacyStatus)) {
    const taskType = typeof metadata.taskType === "number" ? metadata.taskType : 0;
    await withGamification(c, "task-create-closed", (game, role, uid) =>
      game.onTaskClosed({ userId: uid, role, taskId: created.id, taskType }),
    );
  }

  return c.json(ok(toTaskDto(created)), 200);
});
