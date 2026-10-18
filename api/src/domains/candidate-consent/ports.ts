/**
 * Candidate video consent — the application ports every use case takes, the
 * typed error routes map to HTTP, the token primitives and the DTO mapper.
 *
 * Use cases: request-consent.ts (recruiter side), respond-consent.ts (the
 * candidate's public link), consent-gate.ts (the publish gate).
 *
 * Pure domain: no hono, no DB handle, no service imports. The default
 * wiring (Drizzle repository, studio write rule, email, force-unlisted)
 * lives in the composition root services/candidate-consent/candidate-consent-deps.ts.
 */
import type {
  CandidateVideoConsentRow,
  ICandidateVideoConsentRepository,
} from "../../repositories/candidateVideoConsentRepository.js";
import {
  CANDIDATE_CONSENT_EMAIL_MISMATCH_CODE,
  CANDIDATE_CONSENT_EMAIL_NOT_ALLOWED_CODE,
  CANDIDATE_VIDEO_CONSENT_TTL_DAYS,
  type CandidateVideoConsent,
  type CandidateVideoConsentStatus,
} from "../../../../shared/candidate-video-consent.js";
import { randomHex, sha256Hex } from "../../utils/crypto.js";
import { DomainError } from "../errors.js";

/** What the consent email needs (the email adapter's input shape). */
export interface ConsentEmail {
  to: string;
  candidateName: string;
  recruiterName: string;
  jobTitle?: string | null;
  companyName?: string | null;
  message?: string | null;
  /** The raw consent token (never stored). */
  token: string;
  expiresAt: Date;
}

export interface CandidateConsentDeps {
  repo: ICandidateVideoConsentRepository;
  /** The studio write rule (owner / company member / delegate). */
  canWrite: (actor: string, ownerUserId: string, ownerCompanyId: string | null) => Promise<boolean>;
  sendEmail: (input: ConsentEmail) => Promise<void>;
  /** Make the project unlisted + off-profile (services/studio/project-visibility.ts). */
  forceUnlisted: (projectId: string) => Promise<void>;
  now: () => Date;
}

export type CandidateConsentErrorKind =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "VALIDATION"
  | "EMAIL_MISMATCH"
  | "EMAIL_NOT_ALLOWED"
  | "ALREADY_RESPONDED"
  | "NOT_APPROVED"
  | "EXPIRED"
  | "NOT_RESENDABLE";

/** The one CandidateConsentError kind → wire (code, status) mapping. */
const CONSENT_ERROR_HTTP: Record<CandidateConsentErrorKind, { code: string; status: 400 | 403 | 404 | 409 | 410 }> = {
  NOT_FOUND: { code: "NOT_FOUND", status: 404 },
  FORBIDDEN: { code: "FORBIDDEN", status: 403 },
  VALIDATION: { code: "VALIDATION_ERROR", status: 400 },
  EMAIL_MISMATCH: { code: CANDIDATE_CONSENT_EMAIL_MISMATCH_CODE, status: 400 },
  EMAIL_NOT_ALLOWED: { code: CANDIDATE_CONSENT_EMAIL_NOT_ALLOWED_CODE, status: 400 },
  ALREADY_RESPONDED: { code: "CONSENT_ALREADY_RESPONDED", status: 409 },
  NOT_APPROVED: { code: "CONSENT_NOT_APPROVED", status: 409 },
  EXPIRED: { code: "CONSENT_EXPIRED", status: 410 },
  NOT_RESENDABLE: { code: "CONSENT_NOT_RESENDABLE", status: 409 },
};

export class CandidateConsentError extends DomainError {
  constructor(public readonly kind: CandidateConsentErrorKind, message: string) {
    super(CONSENT_ERROR_HTTP[kind].status, CONSENT_ERROR_HTTP[kind].code, message);
    this.name = "CandidateConsentError";
  }
}

// ── Tokens ──────────────────────────────────────────────────────────────────

const TOKEN_RE = /^[0-9a-f]{64}$/;

/** 32 random bytes, hex — the raw token that only ever lives in the email. */
export function generateConsentToken(): string {
  return randomHex(32);
}

export function isWellFormedConsentToken(token: unknown): token is string {
  return typeof token === "string" && TOKEN_RE.test(token);
}

/** sha256 hex — what candidate_video_consents.token_hash stores. */
export function hashConsentToken(token: string): Promise<string> {
  return sha256Hex(token);
}

export function consentExpiry(now: Date): Date {
  return new Date(now.getTime() + CANDIDATE_VIDEO_CONSENT_TTL_DAYS * 24 * 60 * 60 * 1000);
}

// ── DTO ─────────────────────────────────────────────────────────────────────

const iso = (d: Date | string): string => (d instanceof Date ? d.toISOString() : new Date(d).toISOString());

/** A pending row past its expiry reads as expired — computed, never written
 *  on a read (the POST paths persist it). */
export function effectiveStatus(row: CandidateVideoConsentRow, now: Date): CandidateVideoConsentStatus {
  const status = row.status as CandidateVideoConsentStatus;
  if (status === "pending" && new Date(row.expiresAt).getTime() <= now.getTime()) return "expired";
  return status;
}

/** IPv4 → first two octets ("203.0.x.x"); IPv6 → first two groups ("2001:db8:…"). */
export function maskIp(ip: string | null | undefined): string | null {
  const v = ip?.trim();
  if (!v) return null;
  const v4 = v.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (v4) return `${v4[1]}.${v4[2]}.x.x`;
  if (v.includes(":")) {
    const groups = v.split(":").filter(Boolean).slice(0, 2);
    return groups.length ? `${groups.join(":")}:…` : null;
  }
  return null;
}

export function toConsentDto(row: CandidateVideoConsentRow, now: Date): CandidateVideoConsent {
  return {
    id: row.id,
    projectId: row.projectId,
    candidateName: row.candidateName,
    candidateEmail: row.candidateEmail,
    status: effectiveStatus(row, now),
    requestedAt: iso(row.requestedAt),
    respondedAt: row.respondedAt ? iso(row.respondedAt) : null,
    expiresAt: iso(row.expiresAt),
    // The link only ever goes to candidateEmail, so whoever answered it
    // answered from that inbox.
    respondedEmail: row.respondedAt ? row.candidateEmail : null,
    respondedIp: maskIp(row.responseIp),
    withdrawnAt: row.withdrawnAt ? iso(row.withdrawnAt) : null,
  };
}
