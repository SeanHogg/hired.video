/**
 * SuperAdmin course administration — mounted at /api/admin/courses by the
 * admin composite (routes/admin/index.ts), which applies the SA guard.
 * Kept out of the consumer courses.ts surface so its handlers don't branch
 * on auth mode.
 *
 *   POST /issue-backfill-certs              — issue every missing cert (gap #1567);
 *                                             re-fires the LEARNER's badge (#1571)
 *   POST /certificates/:certNumber/revoke   — revoke by cert number { reason };
 *                                             public verify then reports "revoked"
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { ok } from "../utils/response.js";
import { error } from "../types/index.js";
import { AdminCourseCertService } from "../services/admin/AdminCourseCertService.js";
import { gamificationFromContext } from "../domains/gamification/with-gamification.js";

export const adminCourseRoutes = new Hono<AppEnv>();

adminCourseRoutes.post("/issue-backfill-certs", async (c) => {
  const report = await AdminCourseCertService.create().backfill(gamificationFromContext(c));
  return c.json(ok(report));
});

const RevokeSchema = z.object({
  reason: z.string().min(1).max(1000),
});

adminCourseRoutes.post("/certificates/:certNumber/revoke", async (c) => {
  const parsed = RevokeSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  const result = await AdminCourseCertService.create().revoke(c.req.param("certNumber"), parsed.data.reason);
  if (!result) return c.json(error("NOT_FOUND", "Certificate not found"), 404);
  return c.json(ok({ certificate: result }), 200);
});
