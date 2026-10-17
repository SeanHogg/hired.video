/**
 * HTTP adapters shared by the /api/auth sub-routers. /api/auth bypasses the
 * JWT middleware, so bearer-authenticated endpoints read the header here.
 */

import type { Context } from "hono";
import { error } from "../../types/index.js";
import { isDomainError } from "../../domains/errors.js";
import { failFromDomainError } from "../../handlers/shared.js";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ClientContext } from "../../services/auth/twoFactorChallenge.js";
import type { DeferTask } from "../../services/auth/bearerAccount.js";

/** A DomainError as its `{ success:false, error }` envelope + status. */
function renderDomainError(c: Context, err: Parameters<typeof failFromDomainError>[0]): Response {
  const result = failFromDomainError(err);
  return c.json(result.body, result.status as ContentfulStatusCode);
}

/** Run a use case; a thrown DomainError renders as its error envelope, any
 *  other error propagates to the global handler. */
export async function runUseCase(c: Context, run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (err) {
    if (isDomainError(err)) return renderDomainError(c, err);
    throw err;
  }
}

/**
 * Bearer-authenticated endpoint: no `Bearer ` header → 401 "Missing
 * Authorization header". Inside `run`, a DomainError renders as-is and ANY
 * other failure (bad/expired JWT, downstream error) → 401 "Invalid or
 * expired token" — the contract these endpoints have always had.
 */
export async function withBearerToken(c: Context, run: (token: string) => Promise<Response>): Promise<Response> {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json(error("UNAUTHORIZED", "Missing Authorization header"), 401);
  }
  try {
    return await run(authHeader.slice(7));
  } catch (err) {
    if (isDomainError(err)) return renderDomainError(c, err);
    return c.json(error("UNAUTHORIZED", "Invalid or expired token"), 401);
  }
}

/** Request origin recorded on new session rows. */
export function clientContext(c: Context): ClientContext {
  return {
    ipAddress: c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
  };
}

/** Fire-and-forget past the response. */
export function deferTask(c: Context): DeferTask {
  return (task) => c.executionCtx.waitUntil(task);
}
