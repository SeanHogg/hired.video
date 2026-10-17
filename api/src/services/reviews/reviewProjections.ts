/**
 * Review projections — keep the denormalised copies of a review in sync
 * after every write: the feed post that surfaces it and the cached
 * count/average on the parent row. Both are best-effort: a hiccup here
 * is logged and never fails the review write.
 */

import { getSubjectDescriptor, isSubjectType } from "../../../../shared/reviews/subject-descriptors.js";
import { logger } from "../../lib/logger.js";
import { ReviewProjectionsRepository, type DbLike } from "../../repositories/reviewProjectionsRepository.js";
import type { ReviewRow } from "../../repositories/reviewsRepository.js";
import { buildReviewEmbedPayload } from "./reviewMappers.js";

/** Emit (or update) the feed post that surfaces a review. Idempotent
 *  per (subject_type='review', subject_id=reviewId) — re-running on
 *  edit just updates the embed payload. */
async function syncFeedPostForReview(repo: ReviewProjectionsRepository, review: ReviewRow): Promise<void> {
  if (!isSubjectType(review.subjectType)) return;
  if (review.status !== "published") {
    // Reviewer flagged / hid: tear down the feed surfacing too.
    await repo.deleteReviewFeedPost(review.id);
    return;
  }
  const descriptor = getSubjectDescriptor(review.subjectType);
  const embedPayload = buildReviewEmbedPayload(review, descriptor);
  const content = `Reviewed a ${descriptor.noun}: ${review.title}`;

  const existingId = await repo.findReviewFeedPostId(review.id);
  if (existingId) {
    await repo.updateReviewFeedPost(existingId, { content, embedPayload });
    return;
  }
  await repo.insertReviewFeedPost({ userId: review.userId, reviewId: review.id, content, embedPayload });
}

/** Recompute the cached review aggregate on the parent row so directory /
 *  card / OG renders read a denormalized count + avg without re-scanning
 *  the polymorphic `reviews` table. Unwired types are no-ops. */
async function recomputeAggregateCache(
  repo: ReviewProjectionsRepository,
  subjectType: string,
  subjectId: string,
): Promise<void> {
  if (subjectType === "company") {
    await repo.updateCompanyReviewCache(subjectId, await repo.aggregatePublished("company", subjectId));
    return;
  }

  if (subjectType === "promo_project") {
    // The "subject" of a promo_project review is the project, but the
    // cache lives on the creator: aggregate across all of the creator's
    // projects.
    const creatorId = await repo.findPromoProjectCreatorId(subjectId);
    if (!creatorId) return;
    await repo.updateCreatorRatingCache(creatorId, await repo.aggregatePublishedForCreator(creatorId));
    return;
  }

  if (subjectType === "course") {
    await repo.updateCourseRatingCache(subjectId, await repo.aggregatePublished("course", subjectId));
    return;
  }

  // service / voice_clone / article / resume_template / video_template /
  // certification — cache columns don't exist yet, no-op. See gap #793.
}

async function recomputeAggregateCacheSafely(
  repo: ReviewProjectionsRepository,
  subjectType: string,
  subjectId: string,
): Promise<void> {
  try {
    await recomputeAggregateCache(repo, subjectType, subjectId);
  } catch (err) {
    logger.warn("[reviews] aggregate cache recompute failed", err);
  }
}

/** After an upsert/edit: surface in the feed + recompute the parent cache. */
export async function refreshProjectionsAfterWrite(db: DbLike, review: ReviewRow): Promise<void> {
  const repo = new ReviewProjectionsRepository(db);
  try {
    await syncFeedPostForReview(repo, review);
  } catch (err) {
    logger.warn("[reviews] feed sync failed", err);
  }
  await recomputeAggregateCacheSafely(repo, review.subjectType, review.subjectId);
}

/** After a delete: tear down the feed post + recompute the parent cache. */
export async function refreshProjectionsAfterDelete(
  db: DbLike,
  review: { id: string; subjectType: string; subjectId: string },
): Promise<void> {
  const repo = new ReviewProjectionsRepository(db);
  try {
    await repo.deleteReviewFeedPost(review.id);
  } catch (err) {
    logger.warn("[reviews] feed teardown failed", err);
  }
  await recomputeAggregateCacheSafely(repo, review.subjectType, review.subjectId);
}
