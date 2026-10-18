/**
 * HTTP adapters shared by the /api/courses sub-routers: caller identity,
 * the zod-failure + 401 envelopes, `respond`, and the request-scoped
 * gamification port. A thrown DomainError renders via the global handler.
 */
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ZodError } from "zod";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { isSuperAdmin } from "../../middleware/superAdmin.js";
import { gamificationFromContext, withGamification } from "../../domains/gamification/with-gamification.js";
import { pickScoringRole } from "../../../../shared/user-roles.js";
import type { CourseActor } from "../../services/courses/courseAccess.js";
import type { LearnerGamification } from "../../services/courses/courseProgressService.js";

export type CoursesContext = Context<AppEnv>;

/** The authenticated caller as a framework-free actor, or null when anonymous. */
export function courseActor(c: CoursesContext): CourseActor | null {
  const userId = c.var.userId;
  if (!userId) return null;
  const roles = c.var.user?.roles;
  return {
    userId,
    roles: Array.isArray(roles) ? (roles as string[]) : [],
    isSuperAdmin: isSuperAdmin(c.var.user),
  };
}

export function unauthorized(c: CoursesContext): Response {
  return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
}

/** `validateJson` hook: the first zod issue's message (historical shape). */
export function invalidBody(err: ZodError) {
  return error("VALIDATION_ERROR", err.issues[0]?.message ?? "Invalid body");
}

/** Await a use case → `success(data)` at `status`. */
export async function respond<T>(
  c: CoursesContext,
  run: () => Promise<T>,
  status: ContentfulStatusCode = 200,
): Promise<Response> {
  return c.json(success(await run()), status);
}

/** Request-scoped gamification for use cases (no Hono context leaks in). */
export function learnerGamification(c: CoursesContext): LearnerGamification {
  return {
    fire: (label, fn) => withGamification(c, label, fn),
    service: () => gamificationFromContext(c),
    role: pickScoringRole(c.var.user?.roles),
  };
}
