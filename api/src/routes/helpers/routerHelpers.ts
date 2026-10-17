/**
 * Cross-cutting helpers for Hono route handlers in this codebase.
 *
 * Responsibilities:
 *   • requireUser(c) — returns the authenticated user id or a 401 envelope.
 *   • sendHandlerResult(c, result) — renders a pure handler's result.
 *   • mapServiceError(c, err) — translates a thrown ServiceError into the
 *     project's `error()` envelope with the right HTTP status.
 *
 * Keeping these here means individual route handlers don't repeat the
 * "if (!userId) return 401" pattern in every endpoint, and ServiceError
 * codes live in exactly one place that knows about HTTP.
 */

import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { error } from "../../types/index.js";
import type { HandlerResult } from "../../handlers/shared.js";
import {
  ServiceError,
  type ServiceErrorCode,
} from "../../domains/scorecards/scorecardsService.js";

/**
 * Pull the JWT user id off the request. Returns either the userId or an
 * already-rendered 401 response — caller does:
 *
 *   const auth = requireUser(c);
 *   if ("response" in auth) return auth.response;
 *   const { userId } = auth;
 */
export function requireUser(
  c: Context,
): { userId: string } | { response: Response } {
  const userId = (c.var as any).user?.sub as string | undefined;
  if (!userId) {
    return {
      response: c.json(error("UNAUTHORIZED", "Authentication required"), 401),
    };
  }
  return { userId };
}

const SERVICE_ERROR_STATUS: Record<ServiceErrorCode, ContentfulStatusCode> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  CONFLICT: 409,
  VALIDATION_ERROR: 400,
};

/** Render a pure handler's `{ status, body }` result (handlers/shared.ts
 *  `ok()` / `fail()`) as the JSON response. */
export function sendHandlerResult(c: Context, result: HandlerResult): Response {
  return c.newResponse(JSON.stringify(result.body), result.status as ContentfulStatusCode, {
    "Content-Type": "application/json; charset=UTF-8",
  });
}

/** Render a `ServiceError` into the standard JSON error envelope. */
export function mapServiceError(c: Context, err: unknown): Response {
  if (err instanceof ServiceError) {
    return c.json(
      error(err.code, err.message, err.details),
      SERVICE_ERROR_STATUS[err.code],
    );
  }
  // Unknown errors surface as 500. We rethrow so the global error
  // middleware can also log/observe them.
  throw err;
}
