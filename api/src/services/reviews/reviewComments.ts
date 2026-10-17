/**
 * Review comment use cases — threaded list, add (optionally as a reply),
 * delete own. `isSubjectOwner` flags replies by the owner of the reviewed
 * subject so the UI can highlight "company says:" etc.
 */

import { isSubjectType } from "../../../../shared/reviews/subject-descriptors.js";
import { getDb } from "../../db/index.js";
import { DomainError, requireUserId } from "../../domains/errors.js";
import { ReviewCommentsRepository } from "../../repositories/reviewCommentsRepository.js";
import { ReviewsRepository, type DbLike } from "../../repositories/reviewsRepository.js";
import { toReviewCommentDto, type ReviewCommentDto } from "./reviewMappers.js";
import { resolveSubject } from "./reviewSubject.js";

export async function listReviewComments(
  reviewId: string,
  db: DbLike = getDb(),
): Promise<{ items: ReviewCommentDto[] }> {
  const rows = await new ReviewCommentsRepository(db).listPublishedForReview(reviewId);
  return { items: rows.map(toReviewCommentDto) };
}

export async function addReviewComment(
  input: {
    viewerId: string | null;
    reviewId: string;
    /** Lazily-validated body: runs only after the review is found (preserves 404-before-400). */
    parseBody: () => { body: string; parentId?: string | null };
  },
  db: DbLike = getDb(),
): Promise<{ comment: ReviewCommentDto }> {
  const uid = requireUserId(input.viewerId);
  const { reviewId } = input;
  const review = await new ReviewsRepository(db).findById(reviewId);
  if (!review) throw new DomainError(404, "NOT_FOUND", "Review not found");

  const data = input.parseBody();

  let isSubjectOwner = false;
  if (isSubjectType(review.subjectType)) {
    const subject = await resolveSubject(db, review.subjectType, review.subjectId);
    isSubjectOwner = !!subject && subject.ownerId === uid;
  }

  const comments = new ReviewCommentsRepository(db);
  // If parentId is provided, verify it belongs to the same review.
  if (data.parentId) {
    const parent = await comments.findRefById(data.parentId);
    if (!parent || parent.reviewId !== reviewId) {
      throw new DomainError(400, "BAD_REQUEST", "Parent comment doesn't belong to this review");
    }
  }

  const row = await comments.insert({
    reviewId,
    userId: uid,
    parentId: data.parentId ?? null,
    body: data.body,
    isSubjectOwner,
  });
  return { comment: toReviewCommentDto(row) };
}

export async function deleteReviewComment(
  input: { viewerId: string | null; commentId: string },
  db: DbLike = getDb(),
): Promise<void> {
  const uid = requireUserId(input.viewerId);
  const comments = new ReviewCommentsRepository(db);
  const existing = await comments.findRefById(input.commentId);
  if (!existing) throw new DomainError(404, "NOT_FOUND", "Comment not found");
  if (existing.userId !== uid) throw new DomainError(403, "FORBIDDEN", "You can only delete your own comment");
  await comments.deleteById(existing.id);
}
