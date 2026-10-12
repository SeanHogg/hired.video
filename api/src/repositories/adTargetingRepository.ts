/**
 * AdTargetingRepository — runs the targeting predicate built by
 * services/advertising/targeting-sql.ts against the audience FROM clause
 * (`users` LEFT JOIN `user_profiles` LEFT JOIN `job_preferences`).
 *
 * #1769: eligibility and reach are both answered by Postgres with ONE query
 * each — no per-user fact loading, no in-memory filtering.
 */

import { and, count, eq, inArray, type SQL } from "drizzle-orm";
import { schema } from "../db/index.js";

const { users, userProfiles, jobPreferences } = schema;

export type DbLike = any;

export class AdTargetingRepository {
  constructor(private readonly db: DbLike) {}

  private audience(columns: Record<string, unknown>) {
    return this.db
      .select(columns)
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .leftJoin(jobPreferences, eq(jobPreferences.userId, users.id));
  }

  /** How many users the predicate reaches. */
  async countReachable(where: SQL): Promise<number> {
    const [row] = await this.audience({ n: count() }).where(where);
    return Number(row?.n ?? 0);
  }

  /** Whether `userId` is reached by the predicate. */
  async isReachable(userId: string, where: SQL): Promise<boolean> {
    const [row] = await this.audience({ id: users.id })
      .where(and(eq(users.id, userId), where))
      .limit(1);
    return Boolean(row);
  }

  /** The subset of `userIds` the predicate reaches (one query). */
  async reachableAmong(userIds: string[], where: SQL): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const rows: Array<{ id: string }> = await this.audience({ id: users.id })
      .where(and(inArray(users.id, userIds), where));
    return new Set(rows.map((r) => r.id));
  }
}
