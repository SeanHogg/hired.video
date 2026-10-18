/**
 * /api/admin/promotions — SuperAdmin review of the promotion queue (Lane A,
 * #2046). Approve publishes on hired.video's managed brand account
 * (connected via /api/social?lane=managed).
 *
 *   GET  /?status=pending        — queue page (newest first, bounded)
 *   GET  /reach                  — brand-channel reach per platform (cached)
 *   POST /:id/approve            — publish (or retry a failed publish)
 *   POST /:id/reject  {reason}   — decline with a reason shown to the creator
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { isPromotionStatus } from "../../../shared/promotions.js";
import { reachSummary } from "../services/promotions/promotionReach.js";
import {
  approvePromotion,
  listPromotionQueue,
  rejectPromotion,
} from "../services/promotions/promotionUseCases.js";
import { validateJson } from "./helpers/validate.js";

export const adminPromotionRoutes = new Hono<AppEnv>();

adminPromotionRoutes.get("/", async (c) => {
  const status = c.req.query("status") ?? "pending";
  if (!isPromotionStatus(status)) return c.json(error("VALIDATION_ERROR", "Unknown status"), 400);
  return c.json(success({ submissions: await listPromotionQueue(status) }));
});

adminPromotionRoutes.get("/reach", async (c) => c.json(success(await reachSummary(c.env))));

adminPromotionRoutes.post("/:id/approve", async (c) => {
  const submission = await approvePromotion({ reviewerId: c.var.userId, submissionId: c.req.param("id"), env: c.env });
  return c.json(success(submission));
});

const RejectSchema = z.object({ reason: z.string().trim().min(1).max(500) });

adminPromotionRoutes.post("/:id/reject", validateJson(RejectSchema, () => error("VALIDATION_ERROR", "A reason is required"), { emptyBody: null }), async (c) => {
  const body = c.req.valid("json");
  const submission = await rejectPromotion({ reviewerId: c.var.userId, submissionId: c.req.param("id"), reason: body.reason });
  return c.json(success(submission));
});
