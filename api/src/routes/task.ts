import { Hono } from "hono";
import type { Variables } from "../types/index.js";

export const taskRoutes = new Hono<{ Variables: Variables }>();

function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
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
};

const nowIso = () => new Date().toISOString();

function toTaskDto(input: Record<string, unknown>, existing?: TaskDto): TaskDto {
  const now = nowIso();
  return {
    id: existing?.id ?? (typeof input.id === "string" && input.id.length > 0 ? input.id : crypto.randomUUID()),
    text: typeof input.text === "string" && input.text.length > 0 ? input.text : existing?.text ?? "Task",
    description: typeof input.description === "string" ? input.description : existing?.description,
    start: typeof input.start === "string" && input.start.length > 0 ? input.start : existing?.start ?? now,
    end: typeof input.end === "string" ? input.end : existing?.end,
    taskType: typeof input.taskType === "number" ? input.taskType : existing?.taskType ?? 0,
    subTaskType: typeof input.subTaskType === "number" ? input.subTaskType : existing?.subTaskType,
    actionToTake: typeof input.actionToTake === "number" ? input.actionToTake : existing?.actionToTake,
    status: typeof input.status === "number" ? input.status : existing?.status ?? 1,
    assignedToUserId:
      typeof input.assignedToUserId === "string" ? input.assignedToUserId : existing?.assignedToUserId,
    createdByUserId:
      typeof input.createdByUserId === "string" ? input.createdByUserId : existing?.createdByUserId,
    creationDateTime: existing?.creationDateTime ?? now,
    updateDateTime: now,
  };
}

const tasks = new Map<string, TaskDto>();

taskRoutes.get("/", (c) => {
  const result = Array.from(tasks.values());
  return c.json(ok(result), 200);
});

taskRoutes.get("/:id", (c) => {
  const id = c.req.param("id");
  const task = tasks.get(id);
  if (!task) {
    return c.json(ok({ id, text: "Task", start: nowIso(), taskType: 0, status: 1 }), 200);
  }
  return c.json(ok(task), 200);
});

taskRoutes.post("/save", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const existing = typeof body.id === "string" ? tasks.get(body.id) : undefined;
  const task = toTaskDto(body, existing);
  tasks.set(task.id, task);
  return c.json(ok(task), 200);
});

taskRoutes.delete("/:id", (c) => {
  tasks.delete(c.req.param("id"));
  return c.json(ok(true), 200);
});

// Legacy contract fallback: some clients call POST /api/task/{id} to delete
// or mutate a task by id. Keep this to avoid 404s while migrating.
taskRoutes.post("/:id", async (c) => {
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;

  if (!body) {
    tasks.delete(id);
    return c.json(ok(true), 200);
  }

  const existing = tasks.get(id);
  const task = toTaskDto({ ...body, id }, existing);
  tasks.set(id, task);
  return c.json(ok(task), 200);
});

taskRoutes.all("*", (c) =>
  c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "Task routes coming soon" },
      timestamp: new Date().toISOString(),
    },
    501,
  ),
);
