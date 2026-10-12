/**
 * /api/promotions — creator side of the promotion queue (Lane A, #2046).
 *
 *   POST /                      — submit a rendered project for promotion
 *   GET  /project/:projectId    — this project's submissions (+ views) + platform readiness
 *
 * Thin layer: validate → use case → map PromotionError to HTTP.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { UuidLikeSchema } from "../../../shared/validation.js";
import {
  PROMOTION_PLATFORMS,
  PROMOTION_DESCRIPTION_MAX,
  PROMOTION_TITLE_MAX,
} from "../../../shared/promotions.js";
import { WorkspaceForbiddenError } from "../services/studio/workspace.js";
import { socialConnectionServiceFor } from "../services/social/social-connection-factory.js";
import {
  listProjectPromotions,
  submitForPromotion,
} from "../services/promotions/promotionUseCases.js";
import { promotionErrorResponse } from "./promotion-errors.js";

export const promotionRoutes = new Hono<AppEnv>();

const SubmitSchema = z.object({
  projectId: UuidLikeSchema,
  platform: z.enum(PROMOTION_PLATFORMS),
  title: z.string().trim().min(1).max(PROMOTION_TITLE_MAX),
  description: z.string().max(PROMOTION_DESCRIPTION_MAX).default(""),
  /** The fitted cut for this platform (#2045). */
  variantVideoId: UuidLikeSchema.optional(),
});

promotionRoutes.post("/", async (c) => {
  const parsed = SubmitSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid submission", parsed.error.flatten()), 400);
  try {
    const submission = await submitForPromotion({ actorUserId: c.var.user.sub, ...parsed.data, env: c.env });
    return c.json(success(submission), 201);
  } catch (err) {
    if (err instanceof WorkspaceForbiddenError) return c.json(error("FORBIDDEN", err.message), 403);
    return promotionErrorResponse(c, err);
  }
});

promotionRoutes.get("/project/:projectId", async (c) => {
  const projectId = c.req.param("projectId");
  if (!UuidLikeSchema.safeParse(projectId).success) return c.json(error("VALIDATION_ERROR", "Invalid project id"), 400);
  try {
    const social = socialConnectionServiceFor(c.env);
    const [submissions, ready] = await Promise.all([
      listProjectPromotions({ actorUserId: c.var.user.sub, projectId, env: c.env }),
      Promise.all(PROMOTION_PLATFORMS.map(async (platform) => ({ platform, ready: await social.isManagedLaneReady(platform) }))),
    ]);
    return c.json(success({ submissions, platforms: ready }));
  } catch (err) {
    if (err instanceof WorkspaceForbiddenError) return c.json(error("FORBIDDEN", err.message), 403);
    return promotionErrorResponse(c, err);
  }
});
