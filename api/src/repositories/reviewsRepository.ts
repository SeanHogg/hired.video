/**
 * ReviewsRepository — aggregate reads over the polymorphic `reviews` table.
 *
 * `aggregateForSubject` computes the overall average, per-axis sub-rating
 * averages and the star distribution entirely in SQL, so a subject with
 * thousands of reviews no longer streams every `sub_ratings` JSONB blob
 * into the Worker just to average it.
 */

import { and, eq, sql, type SQL } from "drizzle-orm";
import { schema } from "../db/index.js";

export type DbLike = any;

const { reviews } = schema;

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
}
