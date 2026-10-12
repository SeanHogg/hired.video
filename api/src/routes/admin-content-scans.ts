/**
 * /api/admin/content-scans — SuperAdmin review of the explicit-scan gate
 * on the home wall (owner decision 2026-10-10).
 *
 *   GET  /videos?filter=needs_review|approved — blocked / unscreened public
 *                                               videos (or approved overrides)
 *   POST /videos/:id/override {override}      — "pass" (approve onto the wall)
 *                                               or "block" (keep it off);
 *                                               audit-logged
 *   POST /videos/backfill {limit?}            — scan public videos that have
 *                                               no verdict yet (bounded batch)
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { superAdminMiddleware } from "../middleware/superAdmin.js";
import { UuidLikeSchema } from "../../../shared/validation.js";
import { SCAN_OVERRIDES } from "../../../shared/moderation/explicit.js";
import { AUDIT_ACTIONS, auditLog } from "../utils/audit.js";
import { createExplicitScanDeps } from "../services/moderation/explicit/deps.js";
import {
  ScanReviewError,
  backfillVideoScans,
  listVideoScanQueue,
  overrideVideoScan,
} from "../services/moderation/explicit/review.js";

export const adminContentScanRoutes = new Hono<AppEnv>();

adminContentScanRoutes.use("*", superAdminMiddleware);

adminContentScanRoutes.get("/videos", async (c) => {
  const filter = c.req.query("filter") ?? "needs_review";
  if (filter !== "needs_review" && filter !== "approved") return c.json(error("VALIDATION_ERROR", "Unknown filter"), 400);
  return c.json(success({ items: await listVideoScanQueue(filter) }));
});

const OverrideSchema = z.object({ override: z.enum(SCAN_OVERRIDES) }).strict();

adminContentScanRoutes.post("/videos/:id/override", async (c) => {
  const videoId = c.req.param("id");
  if (!UuidLikeSchema.safeParse(videoId).success) return c.json(error("NOT_FOUND", "Video not found"), 404);
  const parsed = OverrideSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "override must be \"pass\" or \"block\""), 400);
  try {
    const scan = await overrideVideoScan({ videoId, override: parsed.data.override, reviewerId: c.var.user.sub });
    await auditLog({
      actorId: c.var.user.sub,
      action: parsed.data.override === "pass" ? AUDIT_ACTIONS.CONTENT_SCAN_APPROVED : AUDIT_ACTIONS.CONTENT_SCAN_KEPT_BLOCKED,
      targetType: "video",
      targetId: videoId,
      metadata: { verdict: scan.verdict, categories: scan.categories },
    });
    return c.json(success({ videoId, overrideVerdict: scan.overrideVerdict }));
  } catch (err) {
    if (err instanceof ScanReviewError) return c.json(error(err.code, err.message), 404);
    throw err;
  }
});

const BackfillSchema = z.object({ limit: z.number().int().min(1).max(25).optional() }).strict();

adminContentScanRoutes.post("/videos/backfill", async (c) => {
  const parsed = BackfillSchema.safeParse((await c.req.json().catch(() => ({}))) ?? {});
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "limit must be 1–25"), 400);
  return c.json(success(await backfillVideoScans(createExplicitScanDeps(c.env), parsed.data.limit)));
});
