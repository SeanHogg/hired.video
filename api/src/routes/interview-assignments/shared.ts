/**
 * Shared envelope + auth helpers for the /api/interview-assignments
 * sub-routers. Envelope shape is this surface's historical one
 * (`{ success, data|error, timestamp }`), kept byte-for-byte.
 */
import type { Context } from "hono";
import type { JwtPayload } from "../../types/index.js";
import { USER_ROLES } from "../../../../shared/user-roles.js";
import type { AssignmentFailure } from "../../services/interview/assignment-result.js";

export function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}

export function fail(code: string, message: string, details?: unknown) {
  return {
    success: false as const,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
    timestamp: new Date().toISOString(),
  };
}

/** Render a use-case failure with its status. */
export function sendFailure(c: Pick<Context, "json">, f: AssignmentFailure): Response {
  return c.json(fail(f.code, f.message), f.status);
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
