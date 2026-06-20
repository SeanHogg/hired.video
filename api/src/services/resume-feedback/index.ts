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
  ReviewDetail,
} from "./ResumeFeedbackService.js";
// `ReviewRole` / `ReviewDetail` shapes are the SSoT in the shared contract.
export type { ReviewRole } from "../../../../shared/resume-feedback.js";
export { defaultResumeFeedbackServiceDeps } from "./deps.js";
