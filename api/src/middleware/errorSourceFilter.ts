import type { MiddlewareHandler } from "hono";
import type { Variables } from "../types/index.js";
import { USER_ROLES } from "../../../shared/user-roles.js";

/**
 * Strips `error._source` from JSON error responses for non-SuperAdmin
 * viewers. The `fail()` and `apiError()` helpers always attach a
 * `{ file, line, column, function }` pointer to the response so a
 * SuperAdmin debugging a customer report can paste the JSON envelope and
 * jump straight to the line that produced it. Regular users never see
 * that field — same envelope, source info elided.
 *
 * Runs on `/api/*` after the route handler. Only touches JSON 4xx/5xx
 * bodies; everything else passes through untouched.
 */
export const errorSourceFilterMiddleware: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  await next();

  const user = c.var.user;
  const isSuperAdmin =
    user?.isSuperAdmin === true ||
    user?.roles?.includes(USER_ROLES.SUPER_ADMIN) === true;
  if (isSuperAdmin) return;

  if (c.res.status < 400) return;
  const contentType = c.res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return;

  let payload: unknown;
  try {
    payload = await c.res.clone().json();
  } catch {
    return;
  }

  if (!payload || typeof payload !== "object") return;
  const err = (payload as { error?: { _source?: unknown } }).error;
  if (!err || typeof err !== "object" || !("_source" in err)) return;

  delete (err as Record<string, unknown>)._source;

  c.res = new Response(JSON.stringify(payload), {
    status: c.res.status,
    headers: c.res.headers,
  });
};
