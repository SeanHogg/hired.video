/**
 * Moderation enums shared across the API and the frontend so the
 * <ReportAbuseDialog> picker stays in lockstep with the backend
 * validator. Owned by the backend schema (`api/src/db/schema/reports.ts`)
 * — when a value is added here, mirror it there and vice versa.
 *
 * The two arrays + the labels below are the single source of truth for
 * "what can be reported" and "for what reason". Routes, forms, admin
 * queue rendering, and notification copy all import from this file.
 */

export const REPORT_ENTITY_TYPES = [
  "resume",
  "job",
  "article",
  "service",
  "voice_clone",
  "feed_post",
  "user_profile",
  "studio_template",
  "studio_project",
] as const;
export type ReportEntityType = (typeof REPORT_ENTITY_TYPES)[number];

export const REPORT_REASONS = [
  "spam",
  "impersonation",
  "inappropriate",
  "harassment",
  "copyright",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = [
  "pending",
  "reviewing",
  "resolved_action_taken",
  "resolved_no_action",
  "dismissed",
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** Human-readable labels for each enum — shared so the dialog picker
 *  and the admin queue render the same strings. Add a new label any
 *  time you add a value to the arrays above. */
export const REPORT_ENTITY_LABEL: Record<ReportEntityType, string> = {
  resume: "Resume",
  job: "Job listing",
  article: "Article",
  service: "Service",
  voice_clone: "Voice clone",
  feed_post: "Feed post",
  user_profile: "User profile",
  studio_template: "Studio template",
  studio_project: "Studio video",
};

export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  spam: "Spam or misleading",
  impersonation: "Impersonating someone",
  inappropriate: "Inappropriate content",
  harassment: "Harassment or hate speech",
  copyright: "Copyright violation",
  other: "Something else",
};

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  pending: "Pending",
  reviewing: "Under review",
  resolved_action_taken: "Action taken",
  resolved_no_action: "No action needed",
  dismissed: "Dismissed",
};
