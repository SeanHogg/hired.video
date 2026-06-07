/**
 * Resume feedback & career coaching domain — single seam for consumers.
 *
 * Reference: shared/resume-feedback.ts, migration 0200_resume_feedback.sql.
 */
export {
  ResumeFeedbackService,
  ResumeFeedbackServiceError,
} from "./ResumeFeedbackService.js";
export type {
  ResumeFeedbackServiceDeps,
  ResumeFeedbackErrorCode,
  ReviewRole,
  ReviewDetail,
} from "./ResumeFeedbackService.js";
export { defaultResumeFeedbackServiceDeps } from "./deps.js";
