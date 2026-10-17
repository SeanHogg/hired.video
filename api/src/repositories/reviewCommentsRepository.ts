/**
 * ReviewCommentsRepository — threaded comments under a polymorphic review.
 * Since W3-A they are `comments` rows with subject_type 'review'
 * (subject_id = reviews.id), projected back to the review-comment shape.
 * Every Drizzle call for review comments lives here.
 */

import { and, asc, eq, sql } from "drizzle-orm";
import { schema } from "../db/index.js";
import { commentsOn } from "./engagementSubjectFilters.js";

export type DbLike = any;

const { comments } = schema;

export interface ReviewCommentRow {
  id: string;
  reviewId: string;
  userId: string;
  parentId: string | null;
  body: string;
  isSubjectOwner: boolean;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

/** author_user_id is always set for review comments (nullable only for
 *  other comment surfaces). */
const reviewCommentColumns = {
  id: comments.id,
  reviewId: comments.subjectId,
  userId: sql<string>`${comments.authorUserId}`,
  parentId: comments.parentId,
  body: comments.body,
  isSubjectOwner: comments.isSubjectOwner,
  status: comments.status,
  createdAt: comments.createdAt,
  updatedAt: comments.updatedAt,
};

const isReviewComment = eq(comments.subjectType, "review");

export class ReviewCommentsRepository {
  constructor(private readonly db: DbLike) {}

  /** Published comments on a review, oldest first (thread order). */
  async listPublishedForReview(reviewId: string): Promise<ReviewCommentRow[]> {
    return this.db
      .select(reviewCommentColumns)
      .from(comments)
      .where(and(commentsOn("review", reviewId), eq(comments.status, "published")))
      .orderBy(asc(comments.createdAt));
  }

  async findRefById(id: string): Promise<{ id: string; reviewId: string; userId: string } | undefined> {
    const [row] = await this.db
      .select({ id: comments.id, reviewId: comments.subjectId, userId: reviewCommentColumns.userId })
      .from(comments)
      .where(and(eq(comments.id, id), isReviewComment))
      .limit(1);
    return row;
  }

  async insert(input: {
    reviewId: string;
    userId: string;
    parentId: string | null;
    body: string;
    isSubjectOwner: boolean;
  }): Promise<ReviewCommentRow> {
    const [row] = await this.db
      .insert(comments)
      .values({
        subjectType: "review",
        subjectId: input.reviewId,
        authorUserId: input.userId,
        parentId: input.parentId,
        body: input.body,
        isSubjectOwner: input.isSubjectOwner,
      })
      .returning(reviewCommentColumns);
    return row;
  }

  /** Replies go with it (parent_id self-FK cascade). */
  async deleteById(id: string): Promise<void> {
    await this.db.delete(comments).where(and(eq(comments.id, id), isReviewComment));
  }
}
