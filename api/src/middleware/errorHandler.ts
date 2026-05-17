import type { ErrorHandler } from "hono";

import { ZodError } from "zod";
import type { ErrorSource } from "../handlers/shared.js";

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

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 500,
  ) {
    super(message);
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
  constructor(message = "Validation failed", public readonly details?: unknown) {
    super("VALIDATION_ERROR", message, 422);
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

  if (err instanceof ZodError) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Validation failed", details: err.flatten(), ...sourceFragment } },
      422,
    );
  }

  if (err instanceof AppError) {
    return c.json(
      {
        error: {
          code: err.code,
          message: err.message,
          ...(err instanceof ValidationError && err.details ? { details: err.details } : {}),
          ...sourceFragment,
        },
      },
      err.status as 400 | 401 | 403 | 404 | 409 | 422 | 500 | 503,
    );
  }

  console.error("[errorHandler]", err);
  return c.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : String(err),
        ...sourceFragment,
      },
    },
    500,
  );
};
