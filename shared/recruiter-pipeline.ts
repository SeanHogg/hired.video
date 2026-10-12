// Recruiter pipeline domain enum — shared between backend (drizzle schema +
// route Zod validation) and frontend (kanban + reports). Single source of
// truth for stage order, labels, and the rejected/hired terminal set.

import type { PitchSummary } from "./pitch.js";

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

/**
 * Confidential-applicant reveal gate (#1679). A candidate in confidential
 * search mode applies anonymously: the employer sees the application but
 * NOT the candidate's identity until they advance the candidate to the
 * shortlist stage (or beyond) — i.e. until the employer has committed
 * real interest. `shortlist` is the threshold; everything at or after it
 * in PIPELINE_STAGES reveals. `rejected` never reveals (a confidential
 * candidate rejected pre-shortlist stays anonymous).
 *
 * Single source of truth — both the pipeline read path (server redaction)
 * and any UI badge import this so the gate can't drift.
 */
const REVEAL_THRESHOLD: PipelineStage = "shortlist";
const REVEAL_INDEX = PIPELINE_STAGES.indexOf(REVEAL_THRESHOLD);

export function isConfidentialIdentityRevealed(stage: PipelineStage | string): boolean {
  if (stage === "rejected") return false;
  const idx = PIPELINE_STAGES.indexOf(stage as PipelineStage);
  return idx >= 0 && idx >= REVEAL_INDEX;
}

/** Placeholder shown in place of a masked confidential candidate's name. */
export const CONFIDENTIAL_CANDIDATE_LABEL = "Confidential candidate";

/** The identity fields redacted while a confidential candidate is masked. */
export interface MaskableCandidateIdentity {
  candidateName?: string | null;
  candidateEmail?: string | null;
  candidatePhone?: string | null;
  candidateLocation?: string | null;
  candidateLinkedinUrl?: string | null;
  candidateResumeUrl?: string | null;
  candidateAvatarUrl?: string | null;
  candidateUserId?: string | null;
  /** The candidate's current video pitch (#2133) — a pitch shows face and
   *  voice, so it is identity and masked with the rest. Null when the
   *  candidate hides their "videoResume" profile section (#2391). */
  candidatePitch?: PitchSummary | null;
}

/**
 * Returns a copy of a pipeline entry with identity fields redacted when
 * the candidate is confidential AND the stage hasn't reached shortlist.
 * Adds `confidentialMasked: true` so the UI can render the "revealed when
 * shortlisted" affordance. Non-confidential or revealed candidates pass
 * through unchanged (with `confidentialMasked: false`).
 *
 * Pure — apply at the read boundary; never persist the masked shape.
 */
export function maskConfidentialCandidate<T extends MaskableCandidateIdentity>(
  entry: T,
  opts: { isConfidential: boolean; stage: PipelineStage | string },
): T & { confidentialMasked: boolean } {
  const reveal = !opts.isConfidential || isConfidentialIdentityRevealed(opts.stage);
  if (reveal) return { ...entry, confidentialMasked: false };
  return {
    ...entry,
    candidateName: CONFIDENTIAL_CANDIDATE_LABEL,
    candidateEmail: null,
    candidatePhone: null,
    candidateLocation: null,
    candidateLinkedinUrl: null,
    candidateResumeUrl: null,
    candidateAvatarUrl: null,
    candidateUserId: null,
    candidatePitch: null,
    confidentialMasked: true,
  };
}

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
