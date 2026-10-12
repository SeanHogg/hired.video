import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types/index.js";
import { isSuperAdmin } from "./superAdmin.js";

/**
 * Strips SuperAdmin-only diagnostic fields from JSON error responses for
 * regular viewers. Two fields are gated today:
 *   - `_source` — `{ file, line, column, function }` pointer attached by
 *     `fail()`, `apiError()`, and the global error handler so a SuperAdmin
 *     debugging a customer report can paste the JSON envelope and jump
 *     straight to the line that produced it.
 *   - `_pg` — Postgres diagnostic fields (code, detail, constraint, …)
 *     extracted from driver errors so DB-layer 500s expose *why* PG
 *     rejected the query, not just the SQL we attempted.
 *
 * Runs on `/api/*` after the route handler. Only touches JSON 4xx/5xx
 * bodies; everything else passes through untouched.
 *
 * It is also the ONE place that parses the error envelope, so before
 * stripping it publishes `c.var.errorEnvelope` ({ code, source }) for the
 * request logger — every request_logs error row keeps its file:line even
 * though the viewer never sees it.
 */
const SUPERADMIN_ONLY_ERROR_FIELDS = ["_source", "_pg"] as const;

function sourceRef(source: unknown): string | null {
  if (!source || typeof source !== "object") return null;
  const { file, line } = source as { file?: unknown; line?: unknown };
  if (typeof file !== "string") return null;
  return typeof line === "number" ? `${file}:${line}` : file;
}

export const errorSourceFilterMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();

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
  const err = (payload as { error?: Record<string, unknown> }).error;
  if (!err || typeof err !== "object") return;

  c.set("errorEnvelope", {
    code: typeof err.code === "string" ? err.code.slice(0, 100) : null,
    source: sourceRef(err._source),
  });
  if (isSuperAdmin(c.var.user)) return;

  let mutated = false;
  for (const field of SUPERADMIN_ONLY_ERROR_FIELDS) {
    if (field in err) {
      delete err[field];
      mutated = true;
    }
  }
  if (!mutated) return;

  c.res = new Response(JSON.stringify(payload), {
    status: c.res.status,
    headers: c.res.headers,
  });
};
