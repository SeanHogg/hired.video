/**
 * Who may approve a candidate video: the candidate, not the recruiter.
 *
 *   1. A talent-pool row's email is authoritative — a different typed email
 *      is EMAIL_MISMATCH.
 *   2. The approver email may not be the recruiter's own address, nor sit on
 *      the recruiter's email domain or a website domain of their company —
 *      unless that domain is a public mailbox provider (two people can both
 *      use gmail.com). Otherwise EMAIL_NOT_ALLOWED.
 */
import {
  domainBelongsTo,
  emailDomain,
  isPublicMailboxDomain,
  websiteDomain,
} from "../../../../shared/public-email-providers.js";
import type { ConsentRecruiterIdentity } from "../../repositories/candidateVideoConsentRepository.js";
import { CandidateConsentError } from "./ports.js";

const normalize = (email: string | null | undefined): string => email?.trim().toLowerCase() ?? "";

/** The approver email to use: the pool row's when it has one. */
export function resolveApproverEmail(poolEmail: string | null | undefined, inputEmail: string | undefined): string | null {
  const pool = normalize(poolEmail);
  const input = normalize(inputEmail);
  if (pool && input && pool !== input) {
    throw new CandidateConsentError("EMAIL_MISMATCH", "The candidate's email on file differs from the one entered");
  }
  return pool || input || null;
}

/** Throws EMAIL_NOT_ALLOWED when the recruiter could answer the link themselves. */
export function assertApproverEmailAllowed(email: string, recruiter: ConsentRecruiterIdentity): void {
  const target = normalize(email);
  const own = normalize(recruiter.email);
  if (own && target === own) {
    throw new CandidateConsentError("EMAIL_NOT_ALLOWED", "The approval must go to the candidate, not to you");
  }
  const domain = emailDomain(target);
  if (!domain || isPublicMailboxDomain(domain)) return;
  const owned = [emailDomain(own), ...recruiter.companyWebsites.map(websiteDomain)]
    .filter((d): d is string => !!d && !isPublicMailboxDomain(d));
  if (owned.some((d) => domainBelongsTo(domain, d))) {
    throw new CandidateConsentError(
      "EMAIL_NOT_ALLOWED",
      "The approval can't go to an address on your or your company's domain",
    );
  }
}
