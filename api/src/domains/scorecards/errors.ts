/**
 * Scorecards domain errors. Thrown as `ServiceError` (a DomainError) with a stable `code`;
 * the status lives on the class, so routes just let it propagate.
 */
import { DomainError, statusForErrorCode } from "../errors.js";

export type ServiceErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "CONFLICT"
  | "VALIDATION_ERROR";

/** A DomainError the global handler renders with the code's status. */
export class ServiceError extends DomainError {
  declare readonly code: ServiceErrorCode;
  constructor(code: ServiceErrorCode, message: string, details?: unknown) {
    super(statusForErrorCode(code), code, message, details);
    this.name = "ServiceError";
  }
}
