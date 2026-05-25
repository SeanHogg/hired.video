/**
 * Content abuse reports (#152).
 *
 * Routes:
 *   POST  /api/reports                       — submit a report (any signed-in user)
 *   GET   /api/reports/me                    — list my own submitted reports
 *   GET   /api/admin/reports                 — admin queue (SuperAdmin only)
 *   PATCH /api/admin/reports/:id/resolve     — admin triage (SuperAdmin only)
 */
import { Hono } from "hono";
import { aliasedTable, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { isSuperAdmin } from "../middleware/superAdmin.js";
import { buildRepos } from "../repositories/index.js";
import {
  REPORT_ENTITY_TYPES,
  REPORT_REASONS,
  REPORT_STATUSES,
} from "../db/schema/reports.js";
import {
  fileReport,
  resolveReport,
  ModerationError,
} from "../services/moderation/moderationService.js";

const { contentReports, users } = schema;

export const reportRoutes = new Hono<AppEnv>();
export const adminReportRoutes = new Hono<AppEnv>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

const CreateReportSchema = z.object({
  entityType: z.enum(REPORT_ENTITY_TYPES),
  entityId: z.string().uuid(),
  reason: z.enum(REPORT_REASONS),
  notes: z.string().max(2000).optional(),
});

const ResolveReportSchema = z.object({
  status: z.enum([
    "reviewing",
    "resolved_action_taken",
    "resolved_no_action",
    "dismissed",
  ] as const),
  resolution: z.string().max(2000).optional(),
});

reportRoutes.post("/", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = CreateReportSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  // Delegated to ModerationService — owner snapshot, admin fan-out,
  // and inbox thread setup all live there so the wiring stays in
  // exactly one place (DRY).
  try {
    const filed = await fileReport({ repos: buildRepos(getDb()) }, {
      reporterId: userId,
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
      reason: parsed.data.reason,
      notes: parsed.data.notes,
    });
    return c.json(success(filed), filed.created ? 201 : 200);
  } catch (e) {
    if (e instanceof ModerationError) {
      return c.json(error(e.code, e.message), e.code === "NOT_FOUND" ? 404 : 400);
    }
    throw e;
  }
});

reportRoutes.get("/me", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const rows = await db.select().from(contentReports)
    .where(eq(contentReports.reporterId, userId))
    .orderBy(desc(contentReports.createdAt));
  return c.json(success(rows), 200);
});

// Admin triage queue — joins both reporter + entity owner so the queue
// UI can render two name chips per row without N+1 fetches.
adminReportRoutes.get("/", async (c) => {
  if (!isSuperAdmin(c.var.user)) return c.json(error("FORBIDDEN", "SuperAdmin only"), 403);
  const db = getDb();
  const status = c.req.query("status");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "100", 10) || 100, 500);

  const allowedStatus = (REPORT_STATUSES as readonly string[]).includes(status ?? "")
    ? (status as (typeof REPORT_STATUSES)[number])
    : null;

  const ownerUsers = aliasedTable(users, "owner_users");
  const rows = await db
    .select({
      report: contentReports,
      reporter: { id: users.id, name: users.name, email: users.email },
      owner: { id: ownerUsers.id, name: ownerUsers.name, email: ownerUsers.email },
    })
    .from(contentReports)
    .innerJoin(users, eq(contentReports.reporterId, users.id))
    .leftJoin(ownerUsers, eq(contentReports.entityOwnerId, ownerUsers.id))
    .where(allowedStatus ? eq(contentReports.status, allowedStatus) : undefined as any)
    .orderBy(desc(contentReports.createdAt))
    .limit(limit);
  return c.json(success(rows), 200);
});

adminReportRoutes.patch("/:id/resolve", async (c) => {
  if (!isSuperAdmin(c.var.user)) return c.json(error("FORBIDDEN", "SuperAdmin only"), 403);
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = ResolveReportSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  // Delegated to ModerationService — the resolver fires reporter +
  // owner notifications + drops a recap message into the existing
  // inbox thread, all idempotently.
  try {
    const updated = await resolveReport({ repos: buildRepos(getDb()) }, {
      reportId: c.req.param("id"),
      resolverUserId: userId,
      status: parsed.data.status,
      resolution: parsed.data.resolution,
    });
    return c.json(success(updated), 200);
  } catch (e) {
    if (e instanceof ModerationError) {
      return c.json(error(e.code, e.message), e.code === "NOT_FOUND" ? 404 : 400);
    }
    throw e;
  }
});
