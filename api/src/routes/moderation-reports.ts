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
} from "../../../shared/moderation.js";
import {
  listContentReportQueue,
  listMyContentReports,
  resolveContentReport,
  submitContentReport,
} from "../services/moderation/moderationReports.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

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

moderationReportRoutes.use("*", async (c, next) => {
  requireUser(c);
  return next();
});

moderationReportRoutes.post("/reports", validateJson(CreateReportSchema, (e) => error("VALIDATION_ERROR", e.issues[0]?.message ?? "Invalid body")), async (c) => {
  const body = c.req.valid("json");
  // ModerationService owns the owner snapshot, admin fan-out and inbox
  // thread setup (DRY).
  const filed = await submitContentReport({
    reporterId: c.var.userId,
    entityType: body.entityType,
    entityId: body.entityId,
    reason: body.reason,
    notes: body.notes,
  });
  return c.json(success(filed), filed.created ? 201 : 200);
});

moderationReportRoutes.get("/reports/me", async (c) => {
  const rows = await listMyContentReports(c.var.userId);
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

adminRoutes.patch("/:id/resolve", validateJson(ResolveReportSchema, (e) => error("VALIDATION_ERROR", e.issues[0]?.message ?? "Invalid body")), async (c) => {
  const body = c.req.valid("json");
  // ModerationService fires reporter + owner notifications and the inbox
  // recap, idempotently.
  const updated = await resolveContentReport({
    reportId: c.req.param("id"),
    resolverUserId: c.var.userId,
    status: body.status,
    resolution: body.resolution,
  });
  return c.json(success(updated), 200);
});

moderationReportRoutes.route("/reports/admin", adminRoutes);
