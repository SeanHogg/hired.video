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
import { socialConnectionServiceFor } from "../services/social/social-connection-factory.js";
import {
  listProjectPromotions,
  submitForPromotion,
} from "../services/promotions/promotionUseCases.js";
import { validateJson } from "./helpers/validate.js";

export const promotionRoutes = new Hono<AppEnv>();

const SubmitSchema = z.object({
  projectId: UuidLikeSchema,
  platform: z.enum(PROMOTION_PLATFORMS),
  title: z.string().trim().min(1).max(PROMOTION_TITLE_MAX),
  description: z.string().max(PROMOTION_DESCRIPTION_MAX).default(""),
  /** The fitted cut for this platform (#2045). */
  variantVideoId: UuidLikeSchema.optional(),
});

promotionRoutes.post("/", validateJson(SubmitSchema, (e) => error("VALIDATION_ERROR", "Invalid submission", e.flatten()), { emptyBody: null }), async (c) => {
  const body = c.req.valid("json");
  const submission = await submitForPromotion({ actorUserId: c.var.userId, ...body, env: c.env });
  return c.json(success(submission), 201);
});

promotionRoutes.get("/project/:projectId", async (c) => {
  const projectId = c.req.param("projectId");
  if (!UuidLikeSchema.safeParse(projectId).success) return c.json(error("VALIDATION_ERROR", "Invalid project id"), 400);
  const social = socialConnectionServiceFor(c.env);
  const [submissions, ready] = await Promise.all([
    listProjectPromotions({ actorUserId: c.var.userId, projectId, env: c.env }),
    Promise.all(PROMOTION_PLATFORMS.map(async (platform) => ({ platform, ready: await social.isManagedLaneReady(platform) }))),
  ]);
  return c.json(success({ submissions, platforms: ready }));
});
