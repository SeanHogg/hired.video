/**
 * Magic-link invite routes:
 *   GET  /invite/:token (PUBLIC) — sanitised invite preview. app.ts lists
 *        `^/api/interview-assignments/invite/[^/]+$` as a public path.
 *   POST /claim/:token           — job seeker claims the invite.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { USER_ROLES } from "../../../../shared/user-roles.js";
import { claimInterviewInvite, previewInterviewInvite } from "../../services/interview/assignment-invites.js";
import { fail, ok, sendFailure } from "./shared.js";

export const interviewAssignmentInviteRoutes = new Hono<AppEnv>();

interviewAssignmentInviteRoutes.get("/invite/:token", async (c) => {
  const result = await previewInterviewInvite(c.req.param("token"));
  if (!result.ok) return sendFailure(c, result);
  return c.json(ok(result.data));
});

interviewAssignmentInviteRoutes.post("/claim/:token", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Sign in to claim"), 401);
  if (!user.roles?.includes(USER_ROLES.JOB_SEEKER)) {
    return c.json(fail("INVALID_ROLE", "Only job seekers can claim an interview assignment"), 403);
  }

  const result = await claimInterviewInvite(user, c.req.param("token"));
  if (!result.ok) return sendFailure(c, result);
  return c.json(ok(result.data));
});
