/**
 * Resume feedback & career coaching domain — single seam for consumers.
 *
 * Reference: shared/resume-feedback.ts, migration 0200_resume_feedback.sql.
 */
export { ResumeFeedbackService } from "./compose.js";
export { ResumeFeedbackServiceError } from "./review-errors.js";
export type { ResumeFeedbackErrorCode } from "./review-errors.js";
export type { ResumeFeedbackServiceDeps } from "./deps.js";
export type { ReviewDetail } from "./review-detail.js";
// `ReviewRole` / `ReviewDetail` shapes are the SSoT in the shared contract.
export type { ReviewRole } from "../../../../shared/resume-feedback.js";
export { defaultResumeFeedbackServiceDeps } from "./deps.js";
