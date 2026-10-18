/**
 * Impersonation session lifecycle — the ONLY routes at /api/admin/impersonate
 * (mounted by the admin composite, routes/admin/index.ts, which applies the
 * SA guard). The SuperAdmin console lives at /api/admin/sa.
 *
 *   POST /                   — start a session
 *   POST /:id/end            — end it
 *   POST /:id/switch-role    — switch the impersonated role
 *   GET  /active             — the caller's open session
 *   GET  /sessions[/:id]     — session history
 */
import { Hono } from "hono";
import { z } from "zod";

import { UUID_LIKE_REGEX } from "../../../../shared/validation.js";
import type { Variables, AppEnv } from "../../types/index.js";
import {
  startImpersonation,
  endImpersonation,
  switchImpersonationRole,
  getActiveSession,
  listSessions,
  getSessionDetail,
} from "../../services/auth/impersonation.js";
import { success, error } from "../../types/index.js";
import { validateJson } from "../helpers/validate.js";

// ── Schemas ───────────────────────────────────────────────────────────────────

const StartSchema = z.object({
  targetUserId: z.string().regex(UUID_LIKE_REGEX, "targetUserId must be a valid UUID"),
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

sessionRoutes.post("/", validateJson(StartSchema, (e) => error("BAD_REQUEST", e.issues[0].message)), async (c) => {
  const body = c.req.valid("json");

  const result = await startImpersonation({ adminId: c.var.userId, ...body });
  if (!result.ok) {
    const err = result as { ok: false; code: string; message: string };
    const status = err.code === "NOT_FOUND" ? 404 : err.code === "FORBIDDEN" ? 403 : 409;
    return c.json(error(err.code, err.message), status);
  }
  return c.json(success(result.result), 201);
});

sessionRoutes.post("/:id/end", async (c) => {
  const result = await endImpersonation(c.var.userId, c.req.param("id"));
  if (!result.ok) {
    const err = result as { ok: false; code: string; message: string };
    return c.json(error(err.code, err.message), err.code === "NOT_FOUND" ? 404 : 409);
  }
  return c.json(success(result.result), 200);
});

sessionRoutes.post("/:id/switch-role", validateJson(SwitchRoleSchema, (e) => error("BAD_REQUEST", e.issues[0].message)), async (c) => {
  const body = c.req.valid("json");

  const result = await switchImpersonationRole(c.var.userId, c.req.param("id"), body.role);
  if (!result.ok) {
    const err = result as { ok: false; code: string; message: string };
    return c.json(error(err.code, err.message), 404);
  }
  return c.json(success(result.result), 200);
});

sessionRoutes.get("/active", async (c) => {
  return c.json(success(await getActiveSession(c.var.userId)), 200);
});

sessionRoutes.get("/sessions", async (c) => {
  const query = PaginationSchema.safeParse(c.req.query());
  if (!query.success) return c.json(error("BAD_REQUEST", query.error.issues[0].message), 400);
  return c.json(success(await listSessions(query.data.page, query.data.limit)), 200);
});

sessionRoutes.get("/sessions/:id", async (c) => {
  const detail = await getSessionDetail(c.req.param("id"));
  if (!detail) return c.json(error("NOT_FOUND", "Session not found"), 404);
  return c.json(success(detail), 200);
});
