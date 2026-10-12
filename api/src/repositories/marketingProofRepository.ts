/**
 * MarketingProofRepository — raw aggregate reads behind the public
 * social-proof figures on the marketing surface. Real counts only; the
 * cached read path lives in `services/marketing/proof-stats.ts`.
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import { schema } from "../db/index.js";

const { resumeInformation, users } = schema;

export type DbLike = any;

export interface IMarketingProofRepository {
  /** Distinct real (non-system) people who have built at least one root resume. */
  countResumeBuilders(): Promise<number>;
}

export class MarketingProofRepository implements IMarketingProofRepository {
  constructor(private readonly db: DbLike) {}

  async countResumeBuilders(): Promise<number> {
    const rows = (await this.db
      .select({ n: sql<number>`count(distinct ${resumeInformation.userId})::int` })
      .from(resumeInformation)
      .innerJoin(users, eq(resumeInformation.userId, users.id))
      .where(and(isNull(resumeInformation.parentId), eq(users.isSystem, false)))) as Array<{ n: number }>;
    return Number(rows[0]?.n ?? 0);
  }
}
