/**
 * HTTP adapters shared by the /api/courses sub-routers: caller identity,
 * lenient JSON body parsing, zod-failure + 401 envelopes, DomainError →
 * envelope rendering, and the request-scoped gamification port.
 */
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ZodError } from "zod";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { isDomainError } from "../../domains/errors.js";
import { isSuperAdmin } from "../../middleware/superAdmin.js";
import { gamificationFromContext, withGamification } from "../../domains/gamification/with-gamification.js";
import { pickScoringRole } from "../../../../shared/user-roles.js";
import type { CourseActor } from "../../services/courses/courseAccess.js";
import type { LearnerGamification } from "../../services/courses/courseProgressService.js";

export type CoursesContext = Context<AppEnv>;

export function uid(c: CoursesContext): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

/** The authenticated caller as a framework-free actor, or null when anonymous. */
export function courseActor(c: CoursesContext): CourseActor | null {
  const userId = uid(c);
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

/** Request body; malformed / missing JSON → `{}` (zod then reports the miss). */
export function readBody(c: CoursesContext): Promise<unknown> {
  return c.req.json().catch(() => ({}));
}

export function validationError(c: CoursesContext, err: ZodError): Response {
  return c.json(error("VALIDATION_ERROR", err.issues[0]?.message ?? "Invalid body"), 400);
}

/** Run a handler body; a thrown DomainError becomes its `error` envelope. */
export async function handle(c: CoursesContext, run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (err) {
    if (isDomainError(err)) {
      return c.json(error(err.code, err.message, err.details), err.status as ContentfulStatusCode);
    }
    throw err;
  }
}

/** Await a use case → `success(data)` at `status`; DomainError → envelope. */
export function respond<T>(
  c: CoursesContext,
  run: () => Promise<T>,
  status: ContentfulStatusCode = 200,
): Promise<Response> {
  return handle(c, async () => c.json(success(await run()), status));
}

/** Request-scoped gamification for use cases (no Hono context leaks in). */
export function learnerGamification(c: CoursesContext): LearnerGamification {
  return {
    fire: (label, fn) => withGamification(c, label, fn),
    service: () => gamificationFromContext(c),
    role: pickScoringRole(c.var.user?.roles),
  };
}
