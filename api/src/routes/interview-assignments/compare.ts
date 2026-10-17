/**
 * GET /api/interview-assignments/compare?ids=<id>,<id>,… — side-by-side view
 * of up to 6 of the recruiter's own interviews. Mounted BEFORE the CRUD
 * router so the static `/compare` path wins over `GET /:id`.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { compareInterviews, COMPARE_MAX_IDS } from "../../services/interview/assignment-review.js";
import { canAssign, fail, ok, sendFailure } from "./shared.js";

export const interviewAssignmentCompareRoutes = new Hono<AppEnv>();

interviewAssignmentCompareRoutes.get("/compare", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Sign in"), 401);
  if (!canAssign(user)) {
    return c.json(fail("FORBIDDEN", "Only recruiters or employers can compare"), 403);
  }

  const raw = c.req.query("ids") ?? "";
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, COMPARE_MAX_IDS);
  if (ids.length < 2) return c.json(fail("VALIDATION_ERROR", "Pass at least 2 ids"), 400);

  const result = await compareInterviews(user.sub, ids);
  if (!result.ok) return sendFailure(c, result);
  return c.json(ok(result.data));
});
