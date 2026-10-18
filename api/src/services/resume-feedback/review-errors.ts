/**
 * The one error type every resume-feedback use case throws — a DomainError
 * carrying its own HTTP status, rendered by the global error handler.
 */
import { DomainError, statusForErrorCode } from "../../domains/errors.js";

export type ResumeFeedbackErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "INVALID_STATE"
  | "CONFLICT";

export class ResumeFeedbackServiceError extends DomainError {
  declare readonly code: ResumeFeedbackErrorCode;
  constructor(code: ResumeFeedbackErrorCode, message: string) {
    super(statusForErrorCode(code, { INVALID_STATE: 409 }), code, message);
    this.name = "ResumeFeedbackServiceError";
  }
}
