/**
 * Workforce routes (#1349 Phase 1+2).
 *
 * Endpoints:
 *   POST   /api/workforce/punch-in        — start a time entry (employee)
 *   POST   /api/workforce/punch-out       — stop the active time entry (employee)
 *   GET    /api/workforce/active          — get the open entry (employee or employer)
 *   GET    /api/workforce/week?periodStart=YYYY-MM-DD  — entries in a week (self)
 *   POST   /api/workforce/timesheets/submit            — submit a week (employee)
 *   POST   /api/workforce/timesheets/:id/approve       — approve a timesheet (employer)
 *   POST   /api/workforce/timesheets/:id/reject        — reject a timesheet (employer)
 *   GET    /api/workforce/timesheets                   — list my timesheets (employee)
 *   GET    /api/workforce/approval-queue               — pending across workforce (employer)
 *   GET    /api/workforce/roster                       — employees + last-7-day totals (employer)
 *
 * Access control:
 *   Employee endpoints check `resolveEmployeeCompanyId(userId)` non-null.
 *   Employer endpoints check `resolveEmployerCompanyIds(userId)` non-empty.
 *   Both checks live in the service layer — the route is a thin wrapper.
 */

import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import {
  punchIn,
  punchOut,
  getActiveTimeEntry,
  getWeekEntries,
  submitTimesheet,
  approveTimesheet,
  rejectTimesheet,
  getEmployeeTimesheets,
  getCompanyApprovalQueue,
  getCompanyRoster,
  getDeskMargin,
  createPlacementDocument,
  listCompanyPlacementDocuments,
  recalculateWorkforceSeats,
  resolveEmployerCompanyIds,
} from "../services/workforce/index.js";

export const workforceRoutes = new Hono<AppEnv>();

function getCurrentUserId(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

function unauthorized(c: any) {
  return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
}

// ---------------------------------------------------------------------------
// Phase 1 — time entries
// ---------------------------------------------------------------------------

workforceRoutes.post("/punch-in", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return unauthorized(c);
  const body = await c.req.json().catch(() => ({}));
  const row = await punchIn(userId, {
    taskId: body.taskId ?? null,
    notes: body.notes ?? null,
    billable: body.billable ?? true,
  });
  return c.json(success(row), 200);
});

workforceRoutes.post("/punch-out", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return unauthorized(c);
  const row = await punchOut(userId);
  return c.json(success(row), 200);
});

workforceRoutes.get("/active", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return unauthorized(c);
  const row = await getActiveTimeEntry(userId);
  return c.json(success(row), 200);
});

workforceRoutes.get("/week", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return unauthorized(c);
  const periodStart = c.req.query("periodStart");
  if (!periodStart || !/^\d{4}-\d{2}-\d{2}$/.test(periodStart)) {
    return c.json(error("BAD_REQUEST", "periodStart must be YYYY-MM-DD"), 400);
  }
  const entries = await getWeekEntries(userId, periodStart);
  return c.json(success({ entries }), 200);
});

// ---------------------------------------------------------------------------
// Phase 2 — timesheets
// ---------------------------------------------------------------------------

workforceRoutes.post("/timesheets/submit", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return unauthorized(c);
  const body = await c.req.json().catch(() => ({}));
  const periodStart = body.periodStart;
  if (!periodStart || !/^\d{4}-\d{2}-\d{2}$/.test(periodStart)) {
    return c.json(error("BAD_REQUEST", "periodStart must be YYYY-MM-DD"), 400);
  }
  const ts = await submitTimesheet(userId, periodStart);
  return c.json(success(ts), 200);
});

workforceRoutes.post("/timesheets/:id/approve", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return unauthorized(c);
  const ts = await approveTimesheet(c.req.param("id"), userId);
  return c.json(success(ts), 200);
});

workforceRoutes.post("/timesheets/:id/reject", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return unauthorized(c);
  const body = await c.req.json().catch(() => ({}));
  const reason = String(body.reason ?? "").trim();
  if (!reason) {
    return c.json(error("BAD_REQUEST", "reason is required when rejecting"), 400);
  }
  const ts = await rejectTimesheet(c.req.param("id"), userId, reason);
  return c.json(success(ts), 200);
});

workforceRoutes.get("/timesheets", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return unauthorized(c);
  const list = await getEmployeeTimesheets(userId);
  return c.json(success({ timesheets: list }), 200);
});

workforceRoutes.get("/approval-queue", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return unauthorized(c);
  const queue = await getCompanyApprovalQueue(userId);
  return c.json(success({ queue }), 200);
});

workforceRoutes.get("/roster", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return unauthorized(c);
  const roster = await getCompanyRoster(userId);
  return c.json(success({ roster }), 200);
});

// ---------------------------------------------------------------------------
// Phase 3 — desk margin reporting (#1422)
// ---------------------------------------------------------------------------

workforceRoutes.get("/desk-margin", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return unauthorized(c);
  const rows = await getDeskMargin(userId);
  return c.json(success({ rows }), 200);
});

// ---------------------------------------------------------------------------
// Phase 4 — placement documents (#1421)
// ---------------------------------------------------------------------------

workforceRoutes.get("/documents", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return unauthorized(c);
  const docs = await listCompanyPlacementDocuments(userId);
  return c.json(success({ documents: docs }), 200);
});

workforceRoutes.post("/documents", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return unauthorized(c);
  const body = await c.req.json().catch(() => ({}));
  if (!body.kind || typeof body.kind !== "string") {
    return c.json(error("BAD_REQUEST", "kind is required"), 400);
  }
  const doc = await createPlacementDocument(userId, {
    placementId: body.placementId ?? null,
    companyId: body.companyId ?? null,
    userId: body.userId ?? null,
    kind: body.kind,
    filePath: body.filePath ?? null,
    providerName: body.providerName ?? null,
    providerRef: body.providerRef ?? null,
    signedAt: body.signedAt ? new Date(body.signedAt) : null,
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
  });
  return c.json(success(doc), 200);
});

// ---------------------------------------------------------------------------
// Seat reconciliation hook (#1409)
//
// Manual trigger for admins / employers to re-sync seat count. Normally
// runs automatically on accept-invitation + remove-account-user; this
// endpoint exists for the recover-from-drift case.
// ---------------------------------------------------------------------------

workforceRoutes.post("/reconcile-seats", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return unauthorized(c);
  const employerCompanies = await resolveEmployerCompanyIds(userId);
  if (employerCompanies.length === 0) {
    return c.json(error("FORBIDDEN", "Not an employer in any workspace"), 403);
  }
  const results = [];
  for (const companyId of employerCompanies) {
    results.push(await recalculateWorkforceSeats(companyId));
  }
  return c.json(success({ results }), 200);
});
