/**
 * Review write use cases — upsert (create-or-update the caller's review on
 * a subject), edit by id, delete by id. The subject descriptor decides
 * whether Pro is required, who's eligible and how the verified badge is
 * earned. Each write refreshes the feed post + parent aggregate cache.
 */

import { getSubjectDescriptor, isSubjectType, type SubjectType } from "../../../../shared/reviews/subject-descriptors.js";
import { getDb } from "../../db/index.js";
import { DomainError, requireUserId } from "../../domains/errors.js";
import { ReviewsRepository, type DbLike, type ReviewRow } from "../../repositories/reviewsRepository.js";
import type { JwtPayload } from "../../types/index.js";
import { validateReviewPayload } from "./reviewMappers.js";
import { assertCanWriteReview } from "./reviewProGate.js";
import { refreshProjectionsAfterDelete, refreshProjectionsAfterWrite } from "./reviewProjections.js";
import { checkEligibility, computeVerification, resolveSubject } from "./reviewSubject.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export async function upsertReview(
  input: {
    user: JwtPayload | null | undefined;
    subjectType: SubjectType;
    subjectId: string;
    rawBody: unknown;
    /** Hashed client IP (null when unknown) — throttles NEW reviews. */
    ipHash: string | null;
  },
  db: DbLike = getDb(),
): Promise<{ review: ReviewRow; isNew: boolean }> {
  const { subjectType, subjectId } = input;
  const descriptor = getSubjectDescriptor(subjectType);
  await assertCanWriteReview(input.user, descriptor);
  const uid = requireUserId(input.user?.sub);

  const subject = await resolveSubject(db, subjectType, subjectId, uid);
  if (!subject) throw new DomainError(404, "NOT_FOUND", `${descriptor.noun} not found`);

  // Eligibility — owner_blocked / buyer_only. Single source of truth in
  // checkEligibility (fails closed when buyerId is unresolved).
  const eligibilityFailure = checkEligibility(descriptor, subject, uid);
  if (eligibilityFailure) {
    throw new DomainError(eligibilityFailure.status, eligibilityFailure.code, eligibilityFailure.message);
  }

  const content = validateReviewPayload(input.rawBody, descriptor);

  // 1-per-day-per-IP throttle on NEW reviews. Edits to an existing review
  // are unrestricted (the unique index gives "1 per subject/user" by
  // itself, so the rate limit is for cross-subject spam from one network).
  const reviews = new ReviewsRepository(db);
  const existing = await reviews.findForSubjectAndUser(subjectType, subjectId, uid);
  const isNew = !existing;
  if (isNew && input.ipHash) {
    const recent = await reviews.countCreatedByIpHashSince(input.ipHash, new Date(Date.now() - ONE_DAY_MS));
    if (recent >= 1) {
      throw new DomainError(
        429,
        "RATE_LIMITED",
        "Only one new review per day from this network. Please try again tomorrow.",
      );
    }
  }

  const verification = await computeVerification(db, descriptor, uid, subject);
  const review = await reviews.upsert({
    subjectType,
    subjectId,
    userId: uid,
    content,
    verification,
    submitterIpHash: input.ipHash,
  });

  await refreshProjectionsAfterWrite(db, review);
  return { review, isNew };
}

export async function editReview(
  input: { user: JwtPayload | null | undefined; reviewId: string; rawBody: unknown },
  db: DbLike = getDb(),
): Promise<ReviewRow> {
  const uid = requireUserId(input.user?.sub);
  const reviews = new ReviewsRepository(db);
  const existing = await reviews.findById(input.reviewId);
  if (!existing) throw new DomainError(404, "NOT_FOUND", "Review not found");
  if (existing.userId !== uid) throw new DomainError(403, "FORBIDDEN", "You can only edit your own review");
  if (!isSubjectType(existing.subjectType)) {
    throw new DomainError(500, "INTERNAL_ERROR", "Review has unknown subject type");
  }
  const descriptor = getSubjectDescriptor(existing.subjectType);
  await assertCanWriteReview(input.user, descriptor);

  const content = validateReviewPayload(input.rawBody, descriptor);
  const review = await reviews.updateContent(existing.id, content);
  await refreshProjectionsAfterWrite(db, review);
  return review;
}

export async function deleteReview(
  input: { viewerId: string | null; reviewId: string },
  db: DbLike = getDb(),
): Promise<void> {
  const uid = requireUserId(input.viewerId);
  const reviews = new ReviewsRepository(db);
  const existing = await reviews.findById(input.reviewId);
  if (!existing) throw new DomainError(404, "NOT_FOUND", "Review not found");
  if (existing.userId !== uid) throw new DomainError(403, "FORBIDDEN", "You can only delete your own review");
  await reviews.deleteById(existing.id);
  await refreshProjectionsAfterDelete(db, existing);
}
