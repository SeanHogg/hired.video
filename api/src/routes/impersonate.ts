import { Hono } from "hono";
import type { Variables } from "../types/index.js";
import { superAdminMiddleware } from "../middleware/superAdmin.js";
import { ok } from "../utils/response.js";
import {
  startImpersonation,
  endImpersonation,
  switchImpersonationRole,
  getActiveSession,
  listSessions,
  getSessionDetail,
} from "../services/impersonation.js";
import {
  searchUsers,
  getUserDetail,
  assignUserRole,
  setUserStatus,
  assignModuleToUser,
  removeModuleFromUser,
} from "../services/adminUsers.js";
import {
  listModules,
  createModule,
  updateModule,
} from "../services/adminModules.js";
import { listAuditLog } from "../utils/audit.js";

export const impersonateRoutes = new Hono<{ Variables: Variables }>();

impersonateRoutes.use("*", superAdminMiddleware);

// ── Impersonation session lifecycle ──────────────────────────────────────────

impersonateRoutes.post("/", async (c) => {
  const { targetUserId, reason, enableDebugger = false } = await c.req.json().catch(() => ({}));

  if (!targetUserId) return c.json({ error: { code: "BAD_REQUEST", message: "targetUserId is required" } }, 400);
  if (!reason?.trim()) return c.json({ error: { code: "BAD_REQUEST", message: "reason is required and must be non-empty" } }, 400);

  const result = await startImpersonation({ adminId: c.var.user.sub, targetUserId, reason, enableDebugger });
  if (!result.ok) return c.json({ error: { code: result.code, message: result.message } }, result.code === "NOT_FOUND" ? 404 : result.code === "FORBIDDEN" ? 403 : 409);

  return c.json(ok(result.result), 201);
});

impersonateRoutes.post("/:id/end", async (c) => {
  const result = await endImpersonation(c.var.user.sub, c.req.param("id"));
  if (!result.ok) return c.json({ error: { code: result.code, message: result.message } }, result.code === "NOT_FOUND" ? 404 : 409);
  return c.json(ok(result.result), 200);
});

impersonateRoutes.post("/:id/switch-role", async (c) => {
  const { role } = await c.req.json().catch(() => ({}));
  if (!role) return c.json({ error: { code: "BAD_REQUEST", message: "role is required" } }, 400);

  const result = await switchImpersonationRole(c.var.user.sub, c.req.param("id"), role);
  if (!result.ok) return c.json({ error: { code: result.code, message: result.message } }, 404);
  return c.json(ok(result.result), 200);
});

impersonateRoutes.get("/active", async (c) => {
  const session = await getActiveSession(c.var.user.sub);
  return c.json(ok(session), 200);
});

impersonateRoutes.get("/sessions", async (c) => {
  const page = Number(c.req.query("page") ?? 1);
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
  return c.json(ok(await listSessions(page, limit)), 200);
});

impersonateRoutes.get("/sessions/:id", async (c) => {
  const detail = await getSessionDetail(c.req.param("id"));
  if (!detail) return c.json({ error: { code: "NOT_FOUND", message: "Session not found" } }, 404);
  return c.json(ok(detail), 200);
});

// ── Cross-tenant user management ──────────────────────────────────────────────

impersonateRoutes.get("/users", async (c) => {
  const page = Number(c.req.query("page") ?? 1);
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
  const search = c.req.query("search");
  const role = c.req.query("role");
  const status = c.req.query("status") as "active" | "suspended" | undefined;

  return c.json(ok(await searchUsers({ page, limit, search, role, status })), 200);
});

impersonateRoutes.get("/users/:id", async (c) => {
  const detail = await getUserDetail(c.req.param("id"));
  if (!detail) return c.json({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);
  return c.json(ok(detail), 200);
});

impersonateRoutes.put("/users/:id/role", async (c) => {
  const { role } = await c.req.json().catch(() => ({}));
  if (!role) return c.json({ error: { code: "BAD_REQUEST", message: "role is required" } }, 400);

  const result = await assignUserRole(c.var.user.sub, c.req.param("id"), role);
  if (!result.ok) return c.json({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);
  return c.json(ok({ userId: c.req.param("id"), role }), 200);
});

impersonateRoutes.put("/users/:id/status", async (c) => {
  const { status } = await c.req.json().catch(() => ({}));
  if (!status || !["active", "suspended"].includes(status)) {
    return c.json({ error: { code: "BAD_REQUEST", message: "status must be 'active' or 'suspended'" } }, 400);
  }

  await setUserStatus(c.var.user.sub, c.req.param("id"), status);
  return c.json(ok({ userId: c.req.param("id"), status }), 200);
});

impersonateRoutes.post("/users/:id/modules", async (c) => {
  const { moduleId } = await c.req.json().catch(() => ({}));
  if (!moduleId) return c.json({ error: { code: "BAD_REQUEST", message: "moduleId is required" } }, 400);

  const result = await assignModuleToUser(c.var.user.sub, c.req.param("id"), moduleId);
  if (!result.ok) return c.json({ error: { code: "NOT_FOUND", message: "Module not found" } }, 404);
  return c.json(ok({ userId: c.req.param("id"), moduleId, moduleName: result.moduleName }), 201);
});

impersonateRoutes.delete("/users/:id/modules/:moduleId", async (c) => {
  await removeModuleFromUser(c.var.user.sub, c.req.param("id"), c.req.param("moduleId"));
  return c.json(ok({ userId: c.req.param("id"), moduleId: c.req.param("moduleId") }), 200);
});

// ── Module CRUD ───────────────────────────────────────────────────────────────

impersonateRoutes.get("/modules", async (c) => {
  return c.json(ok(await listModules()), 200);
});

impersonateRoutes.post("/modules", async (c) => {
  const { name, description, requiredRole, planTier, permissions } = await c.req.json().catch(() => ({}));
  if (!name || !requiredRole) {
    return c.json({ error: { code: "BAD_REQUEST", message: "name and requiredRole are required" } }, 400);
  }

  const mod = await createModule(c.var.user.sub, { name, description, requiredRole, planTier, permissions });
  return c.json(ok(mod), 201);
});

impersonateRoutes.put("/modules/:id", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const result = await updateModule(c.var.user.sub, c.req.param("id"), body);
  if (!result.ok) return c.json({ error: { code: "NOT_FOUND", message: "Module not found" } }, 404);
  return c.json(ok(result.mod), 200);
});

// ── Audit log ─────────────────────────────────────────────────────────────────

impersonateRoutes.get("/audit", async (c) => {
  const page = Number(c.req.query("page") ?? 1);
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  return c.json(ok(await listAuditLog(page, limit)), 200);
});
