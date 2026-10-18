import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../types/index.js";
import { success } from "../types/index.js";
import { withGamificationBadges } from "../domains/gamification/with-gamification.js";
import {
  deletePersonalTask,
  getPersonalTask,
  listPersonalTasks,
  savePersonalTask,
  type TaskClosedAward,
} from "../services/productivity/personal-tasks.js";
import { requireUser } from "./helpers/routerHelpers.js";

export const taskRoutes = new Hono<AppEnv>();

/** The task-closed award bound to this request's JWT role. */
function taskClosedAward(c: Context<AppEnv>): TaskClosedAward {
  return (label, taskId, taskType) =>
    withGamificationBadges(c, label, (game, role, uid) =>
      game.onTaskClosed({ userId: uid, role, taskId, taskType }),
    );
}

taskRoutes.get("/", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await listPersonalTasks(userId)), 200);
});

taskRoutes.get("/:id", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await getPersonalTask(userId, c.req.param("id"))), 200);
});

taskRoutes.post("/save", async (c) => {
  const userId = requireUser(c);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const existingId = typeof body.id === "string" && body.id.length > 0 ? body.id : null;
  return c.json(success(await savePersonalTask(userId, existingId, body, taskClosedAward(c))), 200);
});

taskRoutes.delete("/:id", async (c) => {
  const userId = requireUser(c);
  await deletePersonalTask(userId, c.req.param("id"));
  return c.json(success(true), 200);
});

// Legacy contract: POST /api/task/:id used for update-or-delete
taskRoutes.post("/:id", async (c) => {
  const id = c.req.param("id");
  const userId = requireUser(c);
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;

  if (!body) {
    await deletePersonalTask(userId, id);
    return c.json(success(true), 200);
  }

  // Same `metadata` passthrough as POST /save — keeps the Career 360
  // back-reference (and any future caller-supplied metadata) on
  // round-trip updates instead of getting clobbered by the partial
  // legacy-field set.
  return c.json(success(await savePersonalTask(userId, id, body, taskClosedAward(c))), 200);
});
