import type { ErrorHandler } from "hono";

import { ZodError } from "zod";

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

  if (err instanceof ZodError) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Validation failed", details: err.flatten() } }, 422);
  }

  if (err instanceof AppError) {
    return c.json(
      { error: { code: err.code, message: err.message, ...(err instanceof ValidationError && err.details ? { details: err.details } : {}) } },
      err.status as 400 | 401 | 403 | 404 | 409 | 422 | 500,
    );
  }

  console.error("[errorHandler]", err);
  return c.json({ error: { code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred." } }, 500);
};
