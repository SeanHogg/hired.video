/**
 * Content abuse reports (#152) — moderation, NOT analytics reporting.
 * Mounted at /api/moderation.
 *
 *   POST  /api/moderation/reports                      — submit a report (any signed-in user)
 *   GET   /api/moderation/reports/me                   — my submitted reports
 *   GET   /api/moderation/reports/admin                — triage queue (SuperAdmin)
 *   PATCH /api/moderation/reports/admin/:id/resolve    — triage (SuperAdmin)
 *
 * The SuperAdmin gate is applied once on the admin sub-router.
 */
import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { isSuperAdmin } from "../middleware/superAdmin.js";
import { clampLimit } from "../utils/pagination.js";
import {
  REPORT_ENTITY_TYPES,
  REPORT_REASONS,
  REPORT_STATUSES,
} from "../db/schema/reports.js";
import { ModerationError } from "../services/moderation/moderationService.js";
import {
  listContentReportQueue,
  listMyContentReports,
  resolveContentReport,
  submitContentReport,
} from "../services/moderation/moderationReports.js";

export const moderationReportRoutes = new Hono<AppEnv>();
const adminRoutes = new Hono<AppEnv>();

const CreateReportSchema = z.object({
  entityType: z.enum(REPORT_ENTITY_TYPES),
  entityId: UuidLikeSchema,
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

function moderationErrorResponse(c: any, e: unknown) {
  if (e instanceof ModerationError) {
    return c.json(error(e.code, e.message), e.code === "NOT_FOUND" ? 404 : 400);
  }
  throw e;
}

moderationReportRoutes.use("*", async (c, next) => {
  if (!c.var.user?.sub) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  return next();
});

moderationReportRoutes.post("/reports", async (c) => {
  const parsed = CreateReportSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  // ModerationService owns the owner snapshot, admin fan-out and inbox
  // thread setup (DRY).
  try {
    const filed = await submitContentReport({
      reporterId: c.var.user.sub,
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
      reason: parsed.data.reason,
      notes: parsed.data.notes,
    });
    return c.json(success(filed), filed.created ? 201 : 200);
  } catch (e) {
    return moderationErrorResponse(c, e);
  }
});

moderationReportRoutes.get("/reports/me", async (c) => {
  const rows = await listMyContentReports(c.var.user.sub);
  return c.json(success(rows), 200);
});

adminRoutes.use("*", async (c, next) => {
  if (!isSuperAdmin(c.var.user)) return c.json(error("FORBIDDEN", "SuperAdmin only"), 403);
  return next();
});

adminRoutes.get("/queue", async (c) => {
  const status = c.req.query("status");
  const allowedStatus = (REPORT_STATUSES as readonly string[]).includes(status ?? "")
    ? (status as (typeof REPORT_STATUSES)[number])
    : null;
  const limit = clampLimit(c.req.query("limit"), 100, 500);
  const rows = await listContentReportQueue(allowedStatus, limit);
  return c.json(success(rows), 200);
});

adminRoutes.patch("/:id/resolve", async (c) => {
  const parsed = ResolveReportSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  // ModerationService fires reporter + owner notifications and the inbox
  // recap, idempotently.
  try {
    const updated = await resolveContentReport({
      reportId: c.req.param("id"),
      resolverUserId: c.var.user.sub,
      status: parsed.data.status,
      resolution: parsed.data.resolution,
    });
    return c.json(success(updated), 200);
  } catch (e) {
    return moderationErrorResponse(c, e);
  }
});

moderationReportRoutes.route("/reports/admin", adminRoutes);
