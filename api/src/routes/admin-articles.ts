/**
 * SuperAdmin article review queue — mounted at /api/admin/articles by the
 * admin composite (routes/admin/index.ts), which applies the SA guard.
 * Approvals + rejections are audit-logged; the moderation scan is the same
 * shared service the creator-side submit path uses.
 *
 *   GET  /queue    — submitted articles + author + scan summary
 *   POST /scan     — bulk-scan { ids: string[] }
 *   POST /approve  — bulk-approve { ids: string[] }
 *   POST /reject   — bulk-reject { ids: string[], reason: string }
 */
import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { AdminArticleReviewService } from "../services/admin/AdminArticleReviewService.js";
import { validateJson } from "./helpers/validate.js";

export const adminArticleRoutes = new Hono<AppEnv>();

const IdsSchema = z.object({
  ids: z.array(UuidLikeSchema).min(1).max(100),
});

const RejectSchema = IdsSchema.extend({
  reason: z.string().min(1).max(2000),
});

const QueueQuerySchema = z.object({
  status: z.enum(["submitted", "rejected", "published"]).default("submitted"),
  kind: z.enum(["article", "faq", "guide"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

function invalid(issues: Array<{ message?: string }>, fallback: string) {
  return error("VALIDATION_ERROR", issues[0]?.message ?? fallback);
}

adminArticleRoutes.get("/queue", async (c) => {
  const parsed = QueueQuerySchema.safeParse({
    status: c.req.query("status"),
    kind: c.req.query("kind"),
    limit: c.req.query("limit"),
  });
  if (!parsed.success) return c.json(invalid(parsed.error.issues, "Invalid query"), 400);
  const { status, kind, limit } = parsed.data;
  return c.json(success(await AdminArticleReviewService.create().queue(status, kind, limit)), 200);
});

adminArticleRoutes.post("/scan", validateJson(IdsSchema, (e) => invalid(e.issues, "Invalid body")), async (c) => {
  const body = c.req.valid("json");
  return c.json(success(await AdminArticleReviewService.create().scan(body.ids, c.var.user)), 200);
});

adminArticleRoutes.post("/approve", validateJson(IdsSchema, (e) => invalid(e.issues, "Invalid body")), async (c) => {
  const body = c.req.valid("json");
  return c.json(success(await AdminArticleReviewService.create().approve(body.ids, c.var.userId)), 200);
});

adminArticleRoutes.post("/reject", validateJson(RejectSchema, (e) => invalid(e.issues, "Invalid body")), async (c) => {
  const body = c.req.valid("json");
  const { ids, reason } = body;
  return c.json(success(await AdminArticleReviewService.create().reject(ids, c.var.userId, reason)), 200);
});
