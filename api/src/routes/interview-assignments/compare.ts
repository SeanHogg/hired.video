/**
 * GET /api/interview-assignments/compare?ids=<id>,<id>,… — side-by-side view
 * of up to 6 of the recruiter's own interviews. Mounted BEFORE the CRUD
 * router so the static `/compare` path wins over `GET /:id`.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { compareInterviews, COMPARE_MAX_IDS } from "../../services/interview/assignment-review.js";
import { canAssign, sendFailure } from "./shared.js";
import { success, error } from "../../types/index.js";
import { requireUser } from "../helpers/routerHelpers.js";

export const interviewAssignmentCompareRoutes = new Hono<AppEnv>();

interviewAssignmentCompareRoutes.get("/compare", async (c) => {
  const user = c.var.user;
  requireUser(c);
  if (!canAssign(user)) {
    return c.json(error("FORBIDDEN", "Only recruiters or employers can compare"), 403);
  }

  const raw = c.req.query("ids") ?? "";
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, COMPARE_MAX_IDS);
  if (ids.length < 2) return c.json(error("VALIDATION_ERROR", "Pass at least 2 ids"), 400);

  const result = await compareInterviews(user.sub, ids);
  if (result.ok === false) return sendFailure(c, result);
  return c.json(success(result.data));
});
