/**
 * Cross-cutting helpers for Hono route handlers in this codebase.
 *
 * Responsibilities:
 *   • requireUser(c) — the authenticated user id; throws the 401 DomainError.
 *   • sendHandlerResult(c, result) — renders a pure handler's result.
 *
 * Keeping these here means individual route handlers don't repeat the
 * "if (!userId) return 401" pattern in every endpoint. Typed service errors
 * are DomainErrors that carry their own status (global error handler).
 */

import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Variables } from "../../types/index.js";
import { requireUserId } from "../../domains/errors.js";
import type { HandlerResult } from "../../handlers/shared.js";

/**
 * The authenticated user's id (`c.var.userId`, set by the auth middleware).
 * Behind authMiddleware it is always present; on optional-auth routes an
 * anonymous caller gets the standard 401 — a DomainError the global error
 * handler renders. Usage: `const userId = requireUser(c);`
 */
export function requireUser(c: { var: object }): string {
  return requireUserId((c.var as Partial<Variables>).userId);
}

/** Render a pure handler's `{ status, body }` result (handlers/shared.ts
 *  `ok()` / `fail()`) as the JSON response. */
export function sendHandlerResult(c: Context, result: HandlerResult): Response {
  return c.newResponse(JSON.stringify(result.body), result.status as ContentfulStatusCode, {
    "Content-Type": "application/json; charset=UTF-8",
  });
}
