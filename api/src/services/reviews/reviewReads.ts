/**
 * Review read use cases — public list, aggregate (avg + distribution) and
 * the caller's own review on a subject.
 */

import { getSubjectDescriptor, type SubjectType } from "../../../../shared/reviews/subject-descriptors.js";
import { getDb } from "../../db/index.js";
import { requireUserId } from "../../domains/errors.js";
import { ReviewsRepository, type DbLike } from "../../repositories/reviewsRepository.js";
import { toReviewDto, type ReviewDto } from "./reviewMappers.js";

export async function listSubjectReviews(
  input: { subjectType: SubjectType; subjectId: string; page: number; limit: number },
  db: DbLike = getDb(),
) {
  const { page, limit } = input;
  const offset = (page - 1) * limit;
  const { rows, total } = await new ReviewsRepository(db).listPublishedForSubject(
    input.subjectType,
    input.subjectId,
    limit,
    offset,
  );
  const totalPages = Math.ceil(total / limit);
  return {
    items: rows.map(toReviewDto),
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

/** Overall avg, per-axis sub-rating averages and the star distribution —
 *  all SQL aggregates (axis keys come from the subject descriptor). */
export async function getSubjectAggregate(
  subjectType: SubjectType,
  subjectId: string,
  db: DbLike = getDb(),
) {
  const descriptor = getSubjectDescriptor(subjectType);
  const { total, avgOverall, axisAverages, distribution } = await new ReviewsRepository(db).aggregateForSubject(
    subjectType,
    subjectId,
    descriptor.subRatings.map((axis) => axis.key),
  );
  return {
    total,
    averages: {
      overall: avgOverall,
      ...axisAverages,
    },
    distribution,
  };
}

export async function getOwnReview(
  input: { viewerId: string | null; subjectType: SubjectType; subjectId: string },
  db: DbLike = getDb(),
): Promise<{ review: ReviewDto | null }> {
  const uid = requireUserId(input.viewerId);
  const row = await new ReviewsRepository(db).findForSubjectAndUser(input.subjectType, input.subjectId, uid);
  return { review: row ? toReviewDto(row) : null };
}
