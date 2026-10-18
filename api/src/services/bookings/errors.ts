/** Bookings domain error — a DomainError carrying its own HTTP status. */
import { DomainError, statusForErrorCode } from "../../domains/errors.js";

export type BookingsErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "NOT_ENROLLED"
  | "SLOT_UNAVAILABLE"
  | "INVALID_STATE";

export class BookingsServiceError extends DomainError {
  declare readonly code: BookingsErrorCode;
  constructor(code: BookingsErrorCode, message: string) {
    super(statusForErrorCode(code, { SLOT_UNAVAILABLE: 409, INVALID_STATE: 409, NOT_ENROLLED: 403 }), code, message);
    this.name = "BookingsServiceError";
  }
}
