/**
 * Scorecards domain errors. Thrown as `ServiceError` with a stable `code`
 * so the route layer can map them to HTTP status codes in one place.
 */

export type ServiceErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "CONFLICT"
  | "VALIDATION_ERROR";

export class ServiceError extends Error {
  constructor(
    public readonly code: ServiceErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}
