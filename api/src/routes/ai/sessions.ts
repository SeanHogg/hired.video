/** /api/ai/sessions — the caller's chat sessions (vendor/model never exposed). */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success } from "../../types/index.js";
import { requireUser } from "../helpers/routerHelpers.js";
import { deleteCoachSession, getCoachSession, listCoachSessions } from "../../services/messaging/aiCoachSessions.js";

export const aiSessionRoutes = new Hono<AppEnv>();

// GET /api/ai/sessions — list chat sessions for the current user
aiSessionRoutes.get("/sessions", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await listCoachSessions(userId)), 200);
});

// GET /api/ai/sessions/:id — get session with messages
aiSessionRoutes.get("/sessions/:id", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await getCoachSession(userId, c.req.param("id"))), 200);
});

// DELETE /api/ai/sessions/:id
aiSessionRoutes.delete("/sessions/:id", async (c) => {
  const userId = requireUser(c);
  await deleteCoachSession(userId, c.req.param("id"));
  return c.json(success({ deleted: true }), 200);
});
