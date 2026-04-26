// Recruiter pipeline domain enum — shared between backend (drizzle schema +
// route Zod validation) and frontend (kanban + reports). Single source of
// truth for stage order, labels, and the rejected/hired terminal set.

export const PIPELINE_STAGES = [
  "applied",
  "longlist",
  "screening",
  "interviewing",
  "shortlist",
  "submitted",
  "offer",
  "hired",
  "rejected",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  applied: "Applied",
  longlist: "Long List",
  screening: "Screening",
  interviewing: "Interviewing",
  shortlist: "Short List",
  submitted: "Submitted",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
};

/** Stages that close out a candidate's pipeline journey. */
export const TERMINAL_STAGES: ReadonlySet<PipelineStage> = new Set(["hired", "rejected"]);

export const PIPELINE_ADDED_FROM = ["applied", "manual", "imported", "sourcing_bid"] as const;
export type PipelineAddedFrom = (typeof PIPELINE_ADDED_FROM)[number];

export const PIPELINE_TOUCHPOINT_TYPES = [
  "stage_change",
  "email",
  "sms",
  "call",
  "note",
  "interview_scheduled",
  "rejected",
  "added",
] as const;
export type PipelineTouchpointType = (typeof PIPELINE_TOUCHPOINT_TYPES)[number];
