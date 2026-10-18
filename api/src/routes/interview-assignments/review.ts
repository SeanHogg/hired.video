/**
 * Recruiter review routes:
 *   POST /:id/responses/:rid/score — AI-score one answer
 *   POST /:id/score-all            — AI-score every un-scored answer + roll up
 *   POST /:id/decision             — shortlist / maybe / reject
 *   GET  /:id/report               — interview + responses + candidate (creator OR candidate)
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types/index.js";
import {
  decideInterview,
  getInterviewReport,
  scoreAllInterviewResponses,
  scoreInterviewResponse,
} from "../../services/interview/assignment-review.js";
import { canAssign, sendFailure } from "./shared.js";
import { success, error } from "../../types/index.js";
import { requireUser } from "../helpers/routerHelpers.js";
import { validateJson } from "../helpers/validate.js";

const DecisionSchema = z.object({
  decision: z.enum(["shortlist", "maybe", "reject"]).nullable(),
  reason: z.string().max(2000).optional(),
});

export const interviewAssignmentReviewRoutes = new Hono<AppEnv>();

interviewAssignmentReviewRoutes.post("/:id/responses/:rid/score", async (c) => {
  const user = c.var.user;
  requireUser(c);
  if (!canAssign(user)) {
    return c.json(error("FORBIDDEN", "Only recruiters or employers can score answers"), 403);
  }

  const result = await scoreInterviewResponse(c.env, user, c.req.param("id"), c.req.param("rid"));
  if (result.ok === false) return sendFailure(c, result);
  return c.json(success(result.data));
});

interviewAssignmentReviewRoutes.post("/:id/score-all", async (c) => {
  const user = c.var.user;
  requireUser(c);
  if (!canAssign(user)) {
    return c.json(error("FORBIDDEN", "Only recruiters or employers can score answers"), 403);
  }

  const result = await scoreAllInterviewResponses(c.env, user, c.req.param("id"));
  if (result.ok === false) return sendFailure(c, result);
  return c.json(success(result.data));
});

interviewAssignmentReviewRoutes.post("/:id/decision", validateJson(DecisionSchema, (e) => error("VALIDATION_ERROR", "Invalid decision payload", e.flatten()), { emptyBody: null }), async (c) => {
  const user = c.var.user;
  requireUser(c);
  if (!canAssign(user)) {
    return c.json(error("FORBIDDEN", "Only recruiters or employers can decide"), 403);
  }

  const body = c.req.valid("json");

  const result = await decideInterview(user.sub, c.req.param("id"), { decision: body.decision, reason: body.reason });
  if (result.ok === false) return sendFailure(c, result);
  return c.json(success(result.data));
});

interviewAssignmentReviewRoutes.get("/:id/report", async (c) => {
  const user = c.var.user;
  requireUser(c);

  const result = await getInterviewReport(user.sub, c.req.param("id"));
  if (result.ok === false) return sendFailure(c, result);
  return c.json(success(result.data));
});
