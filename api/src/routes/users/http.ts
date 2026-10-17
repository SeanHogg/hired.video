/**
 * HTTP adapter shared by the `/api/users` sub-routers: run a use case and
 * render its result in the standard `success(data)` envelope, or a thrown
 * DomainError as `error(code, message, details)` with its status. Anything
 * else propagates to the global onError handler (e.g. EXPLICIT_CONTENT).
 */
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { isDomainError } from "../../domains/errors.js";

export async function respond<T>(
  c: Context<AppEnv>,
  run: Promise<T>,
  status: ContentfulStatusCode = 200,
): Promise<Response> {
  try {
    return c.json(success(await run), status);
  } catch (err) {
    return domainErrorResponse(c, err);
  }
}

/** Render a DomainError as its error envelope; rethrow anything else. */
export function domainErrorResponse(c: Context<AppEnv>, err: unknown): Response {
  if (isDomainError(err)) {
    return c.json(error(err.code, err.message, err.details), err.status as ContentfulStatusCode);
  }
  throw err;
}

/** Standard 400 for a failed zod parse. */
export function validationError(c: Context<AppEnv>, message: string, issues: unknown): Response {
  return c.json(error("VALIDATION_ERROR", message, { issues }), 400);
}

/** Schedules post-response work on the Worker execution context. */
export function waitUntilOf(c: Context<AppEnv>): (p: Promise<unknown>) => void {
  return (p) => c.executionCtx.waitUntil(p);
}
