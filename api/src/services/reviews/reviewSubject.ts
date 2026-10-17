/**
 * Review subjects — resolve WHAT is being reviewed and decide whether a
 * reviewer may review it / earns a verified badge.
 *
 *   resolveSubject     per-subject-type lookup (owner, buyer, required state)
 *   checkEligibility   the owner_blocked / buyer_only gate (pure)
 *   computeVerification the descriptor's verified-employee / verified-buyer rule
 */

import type { SubjectDescriptor, SubjectType } from "../../../../shared/reviews/subject-descriptors.js";
import { ReviewSubjectsRepository, type DbLike } from "../../repositories/reviewSubjectsRepository.js";
import { StudioTemplatesRepository } from "../../repositories/studioTemplatesRepository.js";
import { resolveTemplateReviewSubject } from "./templateReviewSubject.js";

/** Pull the registrable domain out of a website URL. Returns null on
 *  bad input. Naive but adequate for "alice@acme.com vs acme.com" —
 *  drops the "www." prefix and ignores subdomains beyond the eTLD+1
 *  level we control by looking at the last two parts. */
function domainFromWebsite(website: string | null | undefined): string | null {
  if (!website) return null;
  try {
    const url = new URL(website.startsWith("http") ? website : `https://${website}`);
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function domainFromEmail(email: string | null | undefined): string | null {
  if (!email || !email.includes("@")) return null;
  return email.split("@")[1]?.toLowerCase() ?? null;
}

/** A resolved subject — what the review flow needs to know about
 *  whatever's being reviewed. `ownerId` blocks self-reviews; `buyerId`
 *  is checked when the descriptor is `buyer_only`; `verifyAgainst`
 *  carries the data the verification rule needs (e.g. company website
 *  domain). `null` from resolveSubject means the subject doesn't exist. */
export interface ResolvedSubject {
  ownerId: string;
  buyerId?: string;
  /** Required state for buyer_only subjects (e.g. promo_project must be 'accepted' to review). */
  requiredState?: { actual: string; required: string };
  verifyAgainst: {
    websiteDomain?: string | null;
  };
}

export async function resolveSubject(
  db: DbLike,
  type: SubjectType,
  id: string,
  /** Reviewer's user id. Optional for the is-owner check at comment time.
   *  Required to populate `buyerId` on many-buyer subjects (course /
   *  template / certification) where the buyer is identified by a
   *  license/enrollment row, not a single column on the subject itself. */
  reviewerId?: string,
): Promise<ResolvedSubject | null> {
  const repo = new ReviewSubjectsRepository(db);
  switch (type) {
    case "company": {
      const row = await repo.findCompany(id);
      if (!row) return null;
      return {
        ownerId: row.ownerId,
        verifyAgainst: { websiteDomain: domainFromWebsite(row.website) },
      };
    }
    case "promo_project": {
      const row = await repo.findPromoProject(id);
      if (!row) return null;
      return {
        ownerId: row.creatorId,
        buyerId: row.customerId,
        requiredState: { actual: row.status, required: "accepted" },
        verifyAgainst: {},
      };
    }
    case "article": {
      const row = await repo.findArticleOwner(id);
      if (!row) return null;
      return { ownerId: row.ownerId, verifyAgainst: {} };
    }
    case "course": {
      const row = await repo.findCourseOwner(id);
      if (!row) return null;
      // For many-buyer subjects we resolve the reviewer's enrollment to
      // populate `buyerId`. Without an enrollment, `buyerId` stays
      // undefined and the buyer_only eligibility check fails closed.
      let buyerId: string | undefined;
      if (reviewerId) {
        const enrol = await repo.findCourseEnrollment(id, reviewerId);
        if (enrol) buyerId = enrol.userId;
      }
      return { ownerId: row.ownerId, buyerId, verifyAgainst: {} };
    }
    // Résumé and video templates are both studio templates (mig 0520) —
    // one lookup; the subject types differ only in their review form.
    case "resume_template":
    case "video_template":
      return resolveTemplateReviewSubject(new StudioTemplatesRepository(db), id, reviewerId);
    case "certification": {
      const row = await repo.findCertificateHolder(id);
      if (!row) return null;
      // For certs the "buyer" semantic == the cert holder. Self-attestation
      // reviews are intentional (Coursera-style "what this cert did for me").
      return { ownerId: row.ownerId, buyerId: row.ownerId, verifyAgainst: {} };
    }
    // Stubbed — descriptor exists, subject lookup not wired yet (404s).
    case "service":
    case "voice_clone":
      return null;
    default:
      return null;
  }
}

/** A failure to enforce; `null` means eligible. Modelled as a nullable
 *  object (not a discriminated `{ok}` union) because this repo compiles with
 *  `strictNullChecks: false`, under which TS does NOT narrow a boolean
 *  discriminant — `if (!d.ok)` would leave the failure fields inaccessible.
 *  A nullable object needs no narrowing: the fields exist on the non-null
 *  type and null is erased by the loose config. */
export type EligibilityFailure = { status: 403 | 400; code: string; message: string };

/** Enforce the descriptor's eligibility rule against a resolved subject.
 *  This is the single source of truth for the owner_blocked / buyer_only
 *  gate — the upsert use case delegates here so the same logic is
 *  exercised in tests.
 *
 *  Critically, `buyer_only` fails CLOSED: a subject whose `buyerId` could
 *  not be resolved (e.g. a `course` reviewer with no `course_enrollments`
 *  row → `buyerId` undefined) is rejected, because `undefined !== uid`. */
export function checkEligibility(
  descriptor: SubjectDescriptor,
  subject: ResolvedSubject,
  reviewerId: string,
): EligibilityFailure | null {
  if (descriptor.eligibility === "owner_blocked" && subject.ownerId === reviewerId) {
    return {
      status: 403,
      code: "FORBIDDEN",
      message: `You cannot review your own ${descriptor.noun}`,
    };
  }
  if (descriptor.eligibility === "buyer_only") {
    if (subject.buyerId !== reviewerId) {
      return { status: 403, code: "FORBIDDEN", message: "Only the buyer can review this" };
    }
    if (subject.requiredState && subject.requiredState.actual !== subject.requiredState.required) {
      return {
        status: 400,
        code: "INVALID_STATE",
        message: `${descriptor.noun} must be ${subject.requiredState.required} before reviewing (currently ${subject.requiredState.actual})`,
      };
    }
  }
  return null;
}

/** Compute the verified-employee / verified-buyer flag at write time.
 *  The descriptor decides which method runs. */
export async function computeVerification(
  db: DbLike,
  descriptor: SubjectDescriptor,
  reviewerUserId: string,
  subject: ResolvedSubject,
): Promise<{ isVerified: boolean; verificationMethod: string | null }> {
  if (descriptor.verification === "none") return { isVerified: false, verificationMethod: null };

  if (descriptor.verification === "email_domain") {
    const subjectDomain = subject.verifyAgainst.websiteDomain ?? null;
    if (!subjectDomain) return { isVerified: false, verificationMethod: null };
    const u = await new ReviewSubjectsRepository(db).findReviewerEmail(reviewerUserId);
    if (!u || !u.emailVerified) return { isVerified: false, verificationMethod: "email_domain" };
    const userDomain = domainFromEmail(u.email);
    return {
      isVerified: !!userDomain && userDomain === subjectDomain,
      verificationMethod: "email_domain",
    };
  }

  if (descriptor.verification === "was_buyer") {
    return {
      isVerified: subject.buyerId === reviewerUserId,
      verificationMethod: "was_buyer",
    };
  }

  return { isVerified: false, verificationMethod: null };
}
