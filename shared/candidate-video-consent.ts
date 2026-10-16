/**
 * Candidate video consent — the vocabulary + wire contract shared by the API
 * (candidate_video_consents, migration 0534) and the frontend.
 *
 * Rule: a recruiter's candidate-for-job video (a studio project carrying a
 * `talent_pool_candidate` subject) may go public or be posted socially only
 * after the candidate approves it through a tokenized email link.
 */
import { z } from "zod";
import { UuidLikeSchema } from "./validation.js";

/** Lifecycle. `pending` → `approved` | `declined` (candidate) | `expired`
 *  (past expires_at) | `revoked` (superseded by a newer request, or — with
 *  `withdrawn_at` set — `approved` → withdrawn by the candidate). The DB
 *  CHECK `candidate_video_consents_status_check` mirrors this list. */
export const CANDIDATE_VIDEO_CONSENT_STATUSES = [
  "pending",
  "approved",
  "declined",
  "expired",
  "revoked",
] as const;

export type CandidateVideoConsentStatus = (typeof CANDIDATE_VIDEO_CONSENT_STATUSES)[number];

/** How long a consent link stays answerable. */
export const CANDIDATE_VIDEO_CONSENT_TTL_DAYS = 14;

/** The error code the publish gates answer (HTTP 403) while consent is missing. */
export const CANDIDATE_CONSENT_REQUIRED_CODE = "CONSENT_REQUIRED" as const;

/** Why the gate refused — `details.reason` on a CONSENT_REQUIRED error.
 *  `content_changed`: the candidate approved a different render / revision
 *  than the project now has, so the UI must ask again. */
export const CANDIDATE_CONSENT_BLOCK_REASONS = [
  "not_requested",
  "pending",
  "declined",
  "expired",
  "revoked",
  "content_changed",
] as const;
export type CandidateConsentBlockReason = (typeof CANDIDATE_CONSENT_BLOCK_REASONS)[number];

/** 400 — the pool row has an email and the request named a different one. */
export const CANDIDATE_CONSENT_EMAIL_MISMATCH_CODE = "CONSENT_EMAIL_MISMATCH" as const;
/** 400 — the approver email is the recruiter's own, or on their / their
 *  company's domain (public mailbox providers excepted). */
export const CANDIDATE_CONSENT_EMAIL_NOT_ALLOWED_CODE = "CONSENT_EMAIL_NOT_ALLOWED" as const;

export function isCandidateVideoConsentStatus(v: unknown): v is CandidateVideoConsentStatus {
  return typeof v === "string" && (CANDIDATE_VIDEO_CONSENT_STATUSES as readonly string[]).includes(v);
}

/** POST /api/recruiter/candidate-video-consents body. Name + email are
 *  optional when `talentPoolCandidateId` names a pool row that has them. */
export const RequestCandidateVideoConsentSchema = z.object({
  projectId: UuidLikeSchema,
  talentPoolCandidateId: UuidLikeSchema.optional(),
  candidateName: z.string().trim().min(1).max(255).optional(),
  candidateEmail: z.string().trim().toLowerCase().email().max(255).optional(),
  message: z.string().trim().max(1000).optional(),
});

export type RequestCandidateVideoConsentInput = z.infer<typeof RequestCandidateVideoConsentSchema>;

/** POST /api/public/candidate-video-consent/:token body. `approve` /
 *  `decline` answer a pending ask (until expires_at); `revoke` withdraws an
 *  approval — allowed for as long as the approval stands, regardless of
 *  expires_at (the link's expiry only bounds the first answer). */
export const CANDIDATE_VIDEO_CONSENT_DECISIONS = ["approve", "decline", "revoke"] as const;
export type CandidateVideoConsentDecision = (typeof CANDIDATE_VIDEO_CONSENT_DECISIONS)[number];

export const RespondCandidateVideoConsentSchema = z.object({
  decision: z.enum(CANDIDATE_VIDEO_CONSENT_DECISIONS),
});

/** The recruiter-facing DTO (never carries the token or its hash). */
export interface CandidateVideoConsent {
  id: string;
  projectId: string;
  candidateName: string;
  candidateEmail: string;
  status: CandidateVideoConsentStatus;
  requestedAt: string;
  respondedAt: string | null;
  expiresAt: string;
  /** The address the approval link went to (= candidateEmail) once answered. */
  respondedEmail: string | null;
  /** The answering IP, masked (IPv4 → first two octets, IPv6 → first two groups). */
  respondedIp: string | null;
  /** When the candidate withdrew an approval (status `revoked`); null otherwise. */
  withdrawnAt: string | null;
}

/** What the candidate's public consent page sees for a token. */
export interface PublicCandidateVideoConsent {
  candidateName: string;
  recruiterName: string;
  jobTitle: string | null;
  companyName: string | null;
  /** The video's unlisted watch URL, when a render exists. */
  videoUrl: string | null;
  /** `revoked` here always means the candidate withdrew (a superseded link
   *  answers 404 instead). `approved` offers "Withdraw consent". */
  status: CandidateVideoConsentStatus;
  expiresAt: string;
}
