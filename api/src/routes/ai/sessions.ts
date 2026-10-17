/** /api/ai/sessions — the caller's chat sessions (vendor/model never exposed). */
import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { getDb, schema } from "../../db/index.js";

export const aiSessionRoutes = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// GET /api/ai/sessions — list chat sessions for the current user
// ---------------------------------------------------------------------------
aiSessionRoutes.get("/sessions", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  // The `model` column is stored for SuperAdmin audit but must NEVER
  // leak to consumers — they only see tokens, not vendors. Same rule
  // applies to /sessions/:id below.
  const sessions = await db
    .select({
      id: schema.aiChatSessions.id,
      title: schema.aiChatSessions.title,
      isActive: schema.aiChatSessions.isActive,
      createdAt: schema.aiChatSessions.createdAt,
      updatedAt: schema.aiChatSessions.updatedAt,
    })
    .from(schema.aiChatSessions)
    .where(eq(schema.aiChatSessions.userId, userId))
    .orderBy(desc(schema.aiChatSessions.updatedAt))
    .limit(50);
  return c.json(success(sessions), 200);
});

// ---------------------------------------------------------------------------
// GET /api/ai/sessions/:id — get session with messages
// ---------------------------------------------------------------------------
aiSessionRoutes.get("/sessions/:id", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [session] = await db
    .select()
    .from(schema.aiChatSessions)
    .where(eq(schema.aiChatSessions.id, c.req.param("id")))
    .limit(1);
  if (!session || session.userId !== userId) return c.json(error("NOT_FOUND", "Session not found"), 404);

  const messages = await db
    .select()
    .from(schema.aiChatMessages)
    .where(eq(schema.aiChatMessages.sessionId, session.id))
    .orderBy(schema.aiChatMessages.createdAt);

  // Strip `model` and `systemPrompt` — both reveal vendor / prompt
  // engineering details that consumers must never see. Audit access to
  // these fields lives on SuperAdmin-only routes.
  const { model: _model, systemPrompt: _sp, ...sessionPublic } = session;
  return c.json(success({ ...sessionPublic, messages }), 200);
});

// ---------------------------------------------------------------------------
// DELETE /api/ai/sessions/:id
// ---------------------------------------------------------------------------
aiSessionRoutes.delete("/sessions/:id", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [session] = await db
    .select({ id: schema.aiChatSessions.id, userId: schema.aiChatSessions.userId })
    .from(schema.aiChatSessions)
    .where(eq(schema.aiChatSessions.id, c.req.param("id")))
    .limit(1);
  if (!session || session.userId !== userId) return c.json(error("NOT_FOUND", "Session not found"), 404);
  await db.delete(schema.aiChatSessions).where(eq(schema.aiChatSessions.id, session.id));
  return c.json(success({ deleted: true }), 200);
});
