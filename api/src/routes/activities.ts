/**
 * Activity routes — the hire→work→pay loop (migration 0492).
 *
 * Endpoints (all authenticated):
 *   Employer:
 *     POST   /api/activities                 — assign a paid activity
 *     GET    /api/activities/company         — activities across my companies
 *     GET    /api/activities/assignable-workers — hired candidates + employees
 *     POST   /api/activities/:id/approve     — approve → accrue payout
 *     POST   /api/activities/:id/reject      — reject (reason) → back to worker
 *   Worker (owner):
 *     GET    /api/activities/assigned        — activities assigned to me
 *     GET    /api/activities/timer/active    — my open timer, if any
 *     POST   /api/activities/:id/timer/start — start the clock (hourly)
 *     POST   /api/activities/:id/timer/stop  — stop the clock
 *     POST   /api/activities/:id/submit      — mark done → submit for approval
 *
 * Access control lives entirely in ActivityService (employer vs owner checks);
 * routes are thin. ForbiddenError → 403 via the global error handler.
 */

import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { activityService } from "../services/activities/ActivityService.js";
import { isActivityPayType } from "../../../shared/activities.js";

export const activityRoutes = new Hono<AppEnv>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}
function unauthorized(c: any) {
  return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
}

// ── Employer ────────────────────────────────────────────────────────────────

activityRoutes.post("/", async (c) => {
  const userId = uid(c);
  if (!userId) return unauthorized(c);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, any>;
  if (!body.workerUserId || typeof body.workerUserId !== "string") {
    return c.json(error("BAD_REQUEST", "workerUserId is required"), 400);
  }
  if (!isActivityPayType(body.payType)) {
    return c.json(error("BAD_REQUEST", "payType must be 'hourly' or 'fixed'"), 400);
  }
  const dto = await activityService.assign(userId, {
    workerUserId: body.workerUserId,
    companyId: typeof body.companyId === "string" ? body.companyId : undefined,
    title: String(body.title ?? ""),
    description: typeof body.description === "string" ? body.description : undefined,
    payType: body.payType,
    rateCents: typeof body.rateCents === "number" ? body.rateCents : undefined,
    amountCents: typeof body.amountCents === "number" ? body.amountCents : undefined,
    currency: typeof body.currency === "string" ? body.currency : undefined,
    dueDate: typeof body.dueDate === "string" ? body.dueDate : null,
  });
  return c.json(success(dto), 200);
});

activityRoutes.get("/company", async (c) => {
  const userId = uid(c);
  if (!userId) return unauthorized(c);
  const activities = await activityService.listForEmployer(userId);
  return c.json(success({ activities }), 200);
});

activityRoutes.get("/assignable-workers", async (c) => {
  const userId = uid(c);
  if (!userId) return unauthorized(c);
  const workers = await activityService.listAssignableWorkers(userId);
  return c.json(success({ workers }), 200);
});

activityRoutes.post("/:id/approve", async (c) => {
  const userId = uid(c);
  if (!userId) return unauthorized(c);
  const dto = await activityService.approve(userId, c.req.param("id"));
  return c.json(success(dto), 200);
});

activityRoutes.post("/:id/reject", async (c) => {
  const userId = uid(c);
  if (!userId) return unauthorized(c);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, any>;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) return c.json(error("BAD_REQUEST", "A rejection reason is required"), 400);
  const dto = await activityService.reject(userId, c.req.param("id"), reason);
  return c.json(success(dto), 200);
});

// ── Worker (owner) ────────────────────────────────────────────────────────────

activityRoutes.get("/assigned", async (c) => {
  const userId = uid(c);
  if (!userId) return unauthorized(c);
  const activities = await activityService.listForWorker(userId);
  return c.json(success({ activities }), 200);
});

activityRoutes.get("/timer/active", async (c) => {
  const userId = uid(c);
  if (!userId) return unauthorized(c);
  const { getActiveTimeEntry } = await import("../services/workforce/index.js");
  const entry = await getActiveTimeEntry(userId);
  return c.json(success(entry), 200);
});

activityRoutes.post("/:id/timer/start", async (c) => {
  const userId = uid(c);
  if (!userId) return unauthorized(c);
  const entry = await activityService.startTimer(userId, c.req.param("id"));
  return c.json(success(entry), 200);
});

activityRoutes.post("/:id/timer/stop", async (c) => {
  const userId = uid(c);
  if (!userId) return unauthorized(c);
  const entry = await activityService.stopTimer(userId, c.req.param("id"));
  return c.json(success(entry), 200);
});

activityRoutes.post("/:id/submit", async (c) => {
  const userId = uid(c);
  if (!userId) return unauthorized(c);
  const dto = await activityService.submit(userId, c.req.param("id"));
  return c.json(success(dto), 200);
});
