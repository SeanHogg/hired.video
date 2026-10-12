/**
 * The one error type every resume-feedback use case throws; the route maps
 * `code` to an HTTP status.
 */
export type ResumeFeedbackErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "INVALID_STATE"
  | "CONFLICT";

export class ResumeFeedbackServiceError extends Error {
  constructor(public readonly code: ResumeFeedbackErrorCode, message: string) {
    super(message);
    this.name = "ResumeFeedbackServiceError";
  }
}
