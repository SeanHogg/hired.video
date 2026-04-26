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
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { USER_ROLES } from "../../../shared/user-roles.js";
import {
  REPORT_ENTITY_TYPES,
  REPORT_REASONS,
  REPORT_STATUSES,
} from "../db/schema/reports.js";

const { contentReports, users } = schema;

export const reportRoutes = new Hono<{ Variables: Variables }>();
export const adminReportRoutes = new Hono<{ Variables: Variables }>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

function isSuperAdmin(c: any): boolean {
  const u = c.var.user as any;
  return u?.isSuperAdmin === true || u?.roles?.includes(USER_ROLES.SUPER_ADMIN);
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
  const db = getDb();

  // Idempotent: if the same reporter already has a pending/reviewing report
  // for the same target, return that row instead of creating a duplicate.
  const [existing] = await db.select().from(contentReports)
    .where(and(
      eq(contentReports.reporterId, userId),
      eq(contentReports.entityType, parsed.data.entityType),
      eq(contentReports.entityId, parsed.data.entityId),
    ))
    .limit(1);
  if (existing && (existing.status === "pending" || existing.status === "reviewing")) {
    return c.json(success(existing), 200);
  }

  const [created] = await db.insert(contentReports).values({
    reporterId: userId,
    entityType: parsed.data.entityType,
    entityId: parsed.data.entityId,
    reason: parsed.data.reason,
    notes: parsed.data.notes ?? null,
    status: "pending",
  } as any).returning();
  return c.json(success(created), 201);
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

// Admin triage queue
adminReportRoutes.get("/", async (c) => {
  if (!isSuperAdmin(c)) return c.json(error("FORBIDDEN", "SuperAdmin only"), 403);
  const db = getDb();
  const status = c.req.query("status");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "100", 10) || 100, 500);

  const allowedStatus = (REPORT_STATUSES as readonly string[]).includes(status ?? "")
    ? (status as (typeof REPORT_STATUSES)[number])
    : null;

  const rows = await db
    .select({
      report: contentReports,
      reporter: { id: users.id, name: users.name, email: users.email },
    })
    .from(contentReports)
    .innerJoin(users, eq(contentReports.reporterId, users.id))
    .where(allowedStatus ? eq(contentReports.status, allowedStatus) : undefined as any)
    .orderBy(desc(contentReports.createdAt))
    .limit(limit);
  return c.json(success(rows), 200);
});

adminReportRoutes.patch("/:id/resolve", async (c) => {
  if (!isSuperAdmin(c)) return c.json(error("FORBIDDEN", "SuperAdmin only"), 403);
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = ResolveReportSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  const db = getDb();
  const [updated] = await db.update(contentReports).set({
    status: parsed.data.status,
    resolution: parsed.data.resolution ?? null,
    resolvedBy: userId,
    resolvedAt: new Date(),
    updatedAt: new Date(),
  } as any).where(eq(contentReports.id, c.req.param("id"))).returning();
  if (!updated) return c.json(error("NOT_FOUND", "Report not found"), 404);
  return c.json(success(updated), 200);
});
