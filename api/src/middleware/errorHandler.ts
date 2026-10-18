import type { ErrorHandler, NotFoundHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import { ZodError } from "zod";
import type { ErrorSource } from "../handlers/shared.js";
import { logger } from "../lib/logger.js";
import { DomainError } from "../domains/errors.js";
import { error } from "../types/index.js";

/** Pull Postgres diagnostic fields off the underlying driver error.
 *  Drizzle wraps the driver error and rethrows with a message that begins
 *  "Failed query: …" — the real PG code/detail/constraint live on the
 *  `cause`. Without this, every DB-layer 500 surfaces only the SQL we
 *  tried to run, not why PG rejected it (e.g. `23503` FK violation +
 *  `Key (session_id)=… is not present in table …`). SuperAdmin sees
 *  these; the errorSourceFilter middleware strips them for everyone else. */
const PG_DIAGNOSTIC_FIELDS = [
  "code",
  "detail",
  "hint",
  "schema",
  "table",
  "column",
  "dataType",
  "constraint",
  "routine",
] as const;
function pgDiagnostics(err: unknown): Record<string, unknown> | null {
  const candidates: unknown[] = [err];
  let cursor: unknown = err;
  for (let i = 0; i < 4 && cursor != null; i++) {
    const next = (cursor as { cause?: unknown }).cause;
    if (next == null || candidates.includes(next)) break;
    candidates.push(next);
    cursor = next;
  }
  for (const c of candidates) {
    if (!c || typeof c !== "object") continue;
    const rec = c as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of PG_DIAGNOSTIC_FIELDS) {
      if (rec[k] != null) out[k] = rec[k];
    }
    if (Object.keys(out).length > 0) return out;
  }
  return null;
}

/** Pull the first usable frame out of a thrown error's stack so the
 *  global handler can attach the same `_source` shape that fail() and
 *  apiError() produce. The errorSourceFilter middleware then decides
 *  whether to expose it (SuperAdmin) or strip it (regular users). */
function sourceFromStack(err: unknown): ErrorSource | null {
  const stack = err instanceof Error ? err.stack : undefined;
  if (!stack) return null;
  const lines = stack.split("\n").slice(1);
  for (const line of lines) {
    const withFn = line.match(/^\s*at\s+(.+?)\s+\((.+):(\d+):(\d+)\)\s*$/);
    if (withFn) {
      return { function: withFn[1], file: withFn[2], line: Number(withFn[3]), column: Number(withFn[4]) };
    }
    const noFn = line.match(/^\s*at\s+(.+):(\d+):(\d+)\s*$/);
    if (noFn) {
      return { function: "<anonymous>", file: noFn[1], line: Number(noFn[2]), column: Number(noFn[3]) };
    }
  }
  return null;
}

/** Legacy (code, message, status) constructor order over the ONE domain
 *  error — every subclass is a DomainError the global handler renders. */
export class AppError extends DomainError {
  constructor(code: string, message: string, status = 500, details?: unknown) {
    super(status, code, message, details);
    this.name = "AppError";
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Unauthorized") {
    super("UNAUTHORIZED", message, 401);
    this.name = "AuthenticationError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super("FORBIDDEN", message, 403);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super("NOT_FOUND", message, 404);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super("CONFLICT", message, 409);
    this.name = "ConflictError";
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed", details?: unknown) {
    super("VALIDATION_ERROR", message, 422, details);
    this.name = "ValidationError";
  }
}

export const globalErrorHandler: ErrorHandler = (err, c) => {
  if (process.env.SENTRY_DSN) {
    // Sentry capture — only if configured
    import("@sentry/node").then(({ captureException }) => captureException(err)).catch(() => {});
  }

  const _source = sourceFromStack(err);
  const sourceFragment = _source ? { _source } : {};
  const _pg = pgDiagnostics(err);
  const pgFragment = _pg ? { _pg } : {};

  const timestamp = new Date().toISOString();

  if (err instanceof ZodError) {
    return c.json(
      {
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Validation failed", details: err.flatten(), ...sourceFragment, ...pgFragment },
        timestamp,
      },
      422,
    );
  }

  // The ONE domain error (AppError and every typed service error extend it):
  // its status + code + details become the standard envelope.
  if (err instanceof DomainError) {
    const extra = err as DomainError & { upgradeUrl?: string };
    return c.json(
      {
        success: false,
        error: {
          code: err.code,
          message: err.message,
          ...(err.details !== undefined && err.details !== null ? { details: err.details } : {}),
          ...(extra.upgradeUrl ? { upgradeUrl: extra.upgradeUrl } : {}),
          ...sourceFragment,
          ...pgFragment,
        },
        timestamp,
      },
      err.status as ContentfulStatusCode,
    );
  }

  logger.error("[errorHandler] unhandled error", _pg ? { error: err, pg: _pg } : err);
  return c.json(
    {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : String(err),
        ...sourceFragment,
        ...pgFragment,
      },
      timestamp,
    },
    500,
  );
};

/** The ONE 404 for every unmatched path (per-router catch-alls are gone;
 *  lazily-mounted routers fall through to here). */
export const notFoundHandler: NotFoundHandler = (c) =>
  c.json(
    error("NOT_FOUND", `No route for ${c.req.method} ${c.req.path}`),
    404,
  );
