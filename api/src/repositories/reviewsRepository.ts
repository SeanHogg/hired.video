/**
 * ReviewsRepository — the polymorphic `reviews` aggregate: list / lookup /
 * upsert / edit / delete rows, plus aggregate reads.
 *
 * `aggregateForSubject` computes the overall average, per-axis sub-rating
 * averages and the star distribution entirely in SQL, so a subject with
 * thousands of reviews no longer streams every `sub_ratings` JSONB blob
 * into the Worker just to average it.
 */

import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { schema } from "../db/index.js";

export type DbLike = any;

const { reviews } = schema;

export type ReviewRow = typeof reviews.$inferSelect;
export type ReviewInsert = typeof reviews.$inferInsert;

/** The editable content of a review (the descriptor-validated payload). */
export interface ReviewContent {
  overallRating: number;
  title: string;
  body: string | null;
  subRatings: Record<string, number>;
  metadata: Record<string, string | null>;
}

export interface ReviewVerification {
  isVerified: boolean;
  verificationMethod: string | null;
}

export interface ReviewSubjectAggregate {
  total: number;
  avgOverall: number | null;
  /** Average per requested sub-rating key (only numeric values in [1,5] count); null when none. */
  axisAverages: Record<string, number | null>;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

/** avg over `sub_ratings ->> key` restricted to JSON numbers in [1, 5]. */
function axisAverage(key: string): SQL<string | null> {
  const raw = sql`${reviews.subRatings} -> ${key}`;
  const text = sql`${reviews.subRatings} ->> ${key}`;
  return sql<string | null>`avg(
    case when jsonb_typeof(${raw}) = 'number' then
      case when (${text})::numeric between 1 and 5 then (${text})::numeric end
    end
  )::float8`;
}

export class ReviewsRepository {
  constructor(private readonly db: DbLike) {}

  async aggregateForSubject(
    subjectType: string,
    subjectId: string,
    axisKeys: readonly string[],
  ): Promise<ReviewSubjectAggregate> {
    const where = and(
      eq(reviews.subjectType, subjectType),
      eq(reviews.subjectId, subjectId),
      eq(reviews.status, "published"),
    );

    const axisCols: Record<string, SQL<string | null>> = {};
    axisKeys.forEach((key, i) => {
      axisCols[`axis${i}`] = axisAverage(key);
    });

    const [aggRows, distRows] = await Promise.all([
      this.db
        .select({
          total: sql<number>`count(*)::int`,
          avgOverall: sql<number | null>`avg(${reviews.overallRating})::float`,
          ...axisCols,
        })
        .from(reviews)
        .where(where),
      this.db
        .select({ bucket: reviews.overallRating, count: sql<number>`count(*)::int` })
        .from(reviews)
        .where(where)
        .groupBy(reviews.overallRating),
    ]);

    const agg = ((aggRows as Array<Record<string, unknown>>)[0] ?? {}) as Record<string, unknown>;
    const axisAverages: Record<string, number | null> = {};
    axisKeys.forEach((key, i) => {
      const v = agg[`axis${i}`];
      axisAverages[key] = v == null ? null : Number(v);
    });

    const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of distRows as Array<{ bucket: number | null; count: number }>) {
      const b = r.bucket as 1 | 2 | 3 | 4 | 5;
      if (b >= 1 && b <= 5) distribution[b] = Number(r.count);
    }

    return {
      total: Number(agg.total ?? 0),
      avgOverall: agg.avgOverall == null ? null : Number(agg.avgOverall),
      axisAverages,
      distribution,
    };
  }

  /** Published reviews on a subject, newest first, plus the total count. */
  async listPublishedForSubject(
    subjectType: string,
    subjectId: string,
    limit: number,
    offset: number,
  ): Promise<{ rows: ReviewRow[]; total: number }> {
    const where = and(
      eq(reviews.subjectType, subjectType),
      eq(reviews.subjectId, subjectId),
      eq(reviews.status, "published"),
    );
    const [rows, [countRow]] = await Promise.all([
      this.db
        .select()
        .from(reviews)
        .where(where)
        .orderBy(desc(reviews.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(reviews).where(where),
    ]);
    return { rows, total: countRow?.count ?? 0 };
  }

  /** The one review a user wrote on a subject (unique per subject/user). */
  async findForSubjectAndUser(
    subjectType: string,
    subjectId: string,
    userId: string,
  ): Promise<ReviewRow | undefined> {
    const [row] = await this.db
      .select()
      .from(reviews)
      .where(
        and(eq(reviews.subjectType, subjectType), eq(reviews.subjectId, subjectId), eq(reviews.userId, userId)),
      )
      .limit(1);
    return row;
  }

  async findById(id: string): Promise<ReviewRow | undefined> {
    const [row] = await this.db.select().from(reviews).where(eq(reviews.id, id)).limit(1);
    return row;
  }

  /** Reviews created from one hashed client IP since `since` (anti-spam throttle). */
  async countCreatedByIpHashSince(ipHash: string, since: Date): Promise<number> {
    const [recent] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(reviews)
      .where(
        and(
          eq(reviews.submitterIpHash, ipHash),
          sql`${reviews.createdAt} >= ${since.toISOString()}::timestamptz`,
        ),
      );
    return recent?.count ?? 0;
  }

  /** Insert, or update the caller's existing review on the same subject. */
  async upsert(input: {
    subjectType: string;
    subjectId: string;
    userId: string;
    content: ReviewContent;
    verification: ReviewVerification;
    submitterIpHash: string | null;
  }): Promise<ReviewRow> {
    const { content, verification } = input;
    const values: ReviewInsert = {
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      userId: input.userId,
      ...content,
      ...verification,
      submitterIpHash: input.submitterIpHash,
    };
    const [row] = await this.db
      .insert(reviews)
      .values(values)
      .onConflictDoUpdate({
        target: [reviews.subjectType, reviews.subjectId, reviews.userId],
        set: { ...content, ...verification, updatedAt: new Date() },
      })
      .returning();
    return row;
  }

  async updateContent(id: string, content: ReviewContent): Promise<ReviewRow> {
    const [row] = await this.db
      .update(reviews)
      .set({ ...content, updatedAt: new Date() })
      .where(eq(reviews.id, id))
      .returning();
    return row;
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(reviews).where(eq(reviews.id, id));
  }
}
