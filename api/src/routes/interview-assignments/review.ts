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
import { canAssign, fail, ok, sendFailure } from "./shared.js";

const DecisionSchema = z.object({
  decision: z.enum(["shortlist", "maybe", "reject"]).nullable(),
  reason: z.string().max(2000).optional(),
});

export const interviewAssignmentReviewRoutes = new Hono<AppEnv>();

interviewAssignmentReviewRoutes.post("/:id/responses/:rid/score", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Sign in"), 401);
  if (!canAssign(user)) {
    return c.json(fail("FORBIDDEN", "Only recruiters or employers can score answers"), 403);
  }

  const result = await scoreInterviewResponse(c.env, user, c.req.param("id"), c.req.param("rid"));
  if (!result.ok) return sendFailure(c, result);
  return c.json(ok(result.data));
});

interviewAssignmentReviewRoutes.post("/:id/score-all", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Sign in"), 401);
  if (!canAssign(user)) {
    return c.json(fail("FORBIDDEN", "Only recruiters or employers can score answers"), 403);
  }

  const result = await scoreAllInterviewResponses(c.env, user, c.req.param("id"));
  if (!result.ok) return sendFailure(c, result);
  return c.json(ok(result.data));
});

interviewAssignmentReviewRoutes.post("/:id/decision", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Sign in"), 401);
  if (!canAssign(user)) {
    return c.json(fail("FORBIDDEN", "Only recruiters or employers can decide"), 403);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = DecisionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid decision payload", parsed.error.flatten()), 400);
  }

  const result = await decideInterview(user.sub, c.req.param("id"), parsed.data);
  if (!result.ok) return sendFailure(c, result);
  return c.json(ok(result.data));
});

interviewAssignmentReviewRoutes.get("/:id/report", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Sign in"), 401);

  const result = await getInterviewReport(user.sub, c.req.param("id"));
  if (!result.ok) return sendFailure(c, result);
  return c.json(ok(result.data));
});
