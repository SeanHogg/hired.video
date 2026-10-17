/**
 * ReviewProjectionsRepository — the denormalised copies of review data that
 * live OUTSIDE the `reviews` table:
 *   • the feed post that surfaces a review (feed_posts subject 'review')
 *   • cached review count + average on the parent row
 *     (company_profiles, creator_profiles via promo_projects, courses)
 */

import { and, eq, sql } from "drizzle-orm";
import { schema } from "../db/index.js";
import { insertPost, updatePost } from "./feedPostsRepository.js";

export type DbLike = any;

const { reviews, feedPosts, companyProfiles, promoProjects, creatorProfiles, courses } = schema;

export interface ReviewAggregateRow {
  cnt: number;
  avg: number | null;
}

function reviewFeedPostWhere(reviewId: string) {
  return and(eq(feedPosts.subjectType, "review"), eq(feedPosts.subjectId, reviewId));
}

export class ReviewProjectionsRepository {
  constructor(private readonly db: DbLike) {}

  // ── Feed post surfacing ────────────────────────────────────────────────

  async findReviewFeedPostId(reviewId: string): Promise<string | undefined> {
    const [existing] = await this.db
      .select({ id: feedPosts.id })
      .from(feedPosts)
      .where(reviewFeedPostWhere(reviewId))
      .limit(1);
    return existing?.id;
  }

  async deleteReviewFeedPost(reviewId: string): Promise<void> {
    await this.db.delete(feedPosts).where(reviewFeedPostWhere(reviewId));
  }

  async updateReviewFeedPost(
    postId: string,
    patch: { content: string; embedPayload: Record<string, unknown> },
  ): Promise<void> {
    await updatePost(this.db, postId, { ...patch, updatedAt: new Date() });
  }

  async insertReviewFeedPost(input: {
    userId: string;
    reviewId: string;
    content: string;
    embedPayload: Record<string, unknown>;
  }): Promise<void> {
    await insertPost(this.db, {
      userId: input.userId,
      content: input.content,
      privacy: "Public",
      subjectType: "review",
      subjectId: input.reviewId,
      embedPayload: input.embedPayload,
    });
  }

  // ── Cached aggregates on the parent row ───────────────────────────────

  /** Published-review count + average for one subject. */
  async aggregatePublished(subjectType: string, subjectId: string): Promise<ReviewAggregateRow | undefined> {
    const [agg] = await this.db
      .select({
        cnt: sql<number>`count(*)::int`,
        avg: sql<number | null>`avg(${reviews.overallRating})::float`,
      })
      .from(reviews)
      .where(
        and(
          eq(reviews.subjectType, subjectType),
          eq(reviews.subjectId, subjectId),
          eq(reviews.status, "published"),
        ),
      );
    return agg;
  }

  async updateCompanyReviewCache(companyId: string, agg: ReviewAggregateRow | undefined): Promise<void> {
    await this.db
      .update(companyProfiles)
      .set({
        reviewCount: agg?.cnt ?? 0,
        reviewAvgOverall: agg?.avg != null ? agg.avg.toFixed(2) : null,
        updatedAt: new Date(),
      })
      .where(eq(companyProfiles.id, companyId));
  }

  async findPromoProjectCreatorId(projectId: string): Promise<string | undefined> {
    const [project] = await this.db
      .select({ creatorId: promoProjects.creatorId })
      .from(promoProjects)
      .where(eq(promoProjects.id, projectId))
      .limit(1);
    return project?.creatorId;
  }

  /** Published promo_project review count + average across ALL of a creator's projects. */
  async aggregatePublishedForCreator(creatorId: string): Promise<ReviewAggregateRow | undefined> {
    const [agg] = await this.db
      .select({
        cnt: sql<number>`count(*)::int`,
        avg: sql<number | null>`avg(${reviews.overallRating})::float`,
      })
      .from(reviews)
      .innerJoin(promoProjects, eq(promoProjects.id, reviews.subjectId))
      .where(
        and(
          eq(reviews.subjectType, "promo_project"),
          eq(reviews.status, "published"),
          eq(promoProjects.creatorId, creatorId),
        ),
      );
    return agg;
  }

  async updateCreatorRatingCache(creatorId: string, agg: ReviewAggregateRow | undefined): Promise<void> {
    await this.db
      .update(creatorProfiles)
      .set({
        // Rounded to 2dp, as the cache has always stored it.
        averageRating: agg?.avg != null ? Number(agg.avg.toFixed(2)) : null,
        ratingCount: agg?.cnt ?? 0,
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.userId, creatorId));
  }

  async updateCourseRatingCache(courseId: string, agg: ReviewAggregateRow | undefined): Promise<void> {
    await this.db
      .update(courses)
      .set({
        averageRating: agg?.avg ?? null,
        ratingCount: agg?.cnt ?? 0,
        updatedAt: new Date(),
      })
      .where(eq(courses.id, courseId));
  }
}
