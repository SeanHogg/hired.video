import { Hono } from "hono";
import { z } from "zod";
import type { Variables, AppEnv } from "../types/index.js";
import { ok } from "../../utils/response.js";
import {
  startImpersonation,
  endImpersonation,
  switchImpersonationRole,
  getActiveSession,
  listSessions,
  getSessionDetail,
} from "../../services/auth/impersonation.js";

// ── Schemas ───────────────────────────────────────────────────────────────────

const StartSchema = z.object({
  targetUserId: z.string().uuid("targetUserId must be a valid UUID"),
  reason: z.string().min(1, "reason is required and must be non-empty").max(500),
  enableDebugger: z.boolean().optional().default(false),
});

const SwitchRoleSchema = z.object({
  role: z.string().min(1, "role is required"),
});

const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// ── Router ────────────────────────────────────────────────────────────────────

export const sessionRoutes = new Hono<AppEnv>();

sessionRoutes.post("/", async (c) => {
  const body = StartSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: { code: "BAD_REQUEST", message: body.error.issues[0].message } }, 400);

  const result = await startImpersonation({ adminId: c.var.user.sub, ...body.data });
  if (!result.ok) {
    const err = result as { ok: false; code: string; message: string };
    const status = err.code === "NOT_FOUND" ? 404 : err.code === "FORBIDDEN" ? 403 : 409;
    return c.json({ error: { code: err.code, message: err.message } }, status);
  }
  return c.json(ok(result.result), 201);
});

sessionRoutes.post("/:id/end", async (c) => {
  const result = await endImpersonation(c.var.user.sub, c.req.param("id"));
  if (!result.ok) {
    const err = result as { ok: false; code: string; message: string };
    return c.json({ error: { code: err.code, message: err.message } }, err.code === "NOT_FOUND" ? 404 : 409);
  }
  return c.json(ok(result.result), 200);
});

sessionRoutes.post("/:id/switch-role", async (c) => {
  const body = SwitchRoleSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: { code: "BAD_REQUEST", message: body.error.issues[0].message } }, 400);

  const result = await switchImpersonationRole(c.var.user.sub, c.req.param("id"), body.data.role);
  if (!result.ok) {
    const err = result as { ok: false; code: string; message: string };
    return c.json({ error: { code: err.code, message: err.message } }, 404);
  }
  return c.json(ok(result.result), 200);
});

sessionRoutes.get("/active", async (c) => {
  return c.json(ok(await getActiveSession(c.var.user.sub)), 200);
});

sessionRoutes.get("/sessions", async (c) => {
  const query = PaginationSchema.safeParse(c.req.query());
  if (!query.success) return c.json({ error: { code: "BAD_REQUEST", message: query.error.issues[0].message } }, 400);
  return c.json(ok(await listSessions(query.data.page, query.data.limit)), 200);
});

sessionRoutes.get("/sessions/:id", async (c) => {
  const detail = await getSessionDetail(c.req.param("id"));
  if (!detail) return c.json({ error: { code: "NOT_FOUND", message: "Session not found" } }, 404);
  return c.json(ok(detail), 200);
});
