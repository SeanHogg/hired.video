/**
 * Shared auth + failure helpers for the /api/interview-assignments
 * sub-routers (envelopes are the standard success()/error()).
 */
import type { Context } from "hono";
import type { JwtPayload } from "../../types/index.js";
import { USER_ROLES } from "../../../../shared/user-roles.js";
import type { AssignmentFailure } from "../../services/interview/assignment-result.js";
import { error } from "../../types/index.js";

/** Render a use-case failure with its status. */
export function sendFailure(c: Pick<Context, "json">, f: AssignmentFailure): Response {
  return c.json(error(f.code, f.message), f.status);
}

const ASSIGNABLE_ROLES: ReadonlySet<string> = new Set([
  USER_ROLES.RECRUITER,
  USER_ROLES.EMPLOYER,
  USER_ROLES.ADMIN,
  USER_ROLES.SUPER_ADMIN,
]);

/** Recruiter-side roles allowed to assign, score, decide and compare. */
export function canAssign(user: JwtPayload): boolean {
  return Boolean(user.roles?.some((r) => ASSIGNABLE_ROLES.has(r)));
}
