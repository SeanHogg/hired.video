/** Hiring decisions persistence. */

import { and, desc, eq, inArray } from "drizzle-orm";
import { schema } from "../../db/index.js";
import type { IHiringDecisionsRepository } from "./interfaces.js";
import type {
  DbLike,
  HiringDecisionRow,
  NewHiringDecision,
} from "./types.js";

const { hiringDecisions } = schema;

export class HiringDecisionsRepository implements IHiringDecisionsRepository {
  constructor(private readonly db: DbLike) {}

  async findDecisionsForApplication(
    applicationId: string,
    companyIds: readonly string[],
  ): Promise<HiringDecisionRow[]> {
    if (companyIds.length === 0) return [];
    return (await this.db
      .select()
      .from(hiringDecisions)
      .where(
        and(
          eq(hiringDecisions.applicationId, applicationId),
          inArray(hiringDecisions.companyId, companyIds as string[]),
        ),
      )
      .orderBy(desc(hiringDecisions.decidedAt))) as HiringDecisionRow[];
  }

  async insertDecision(input: NewHiringDecision): Promise<HiringDecisionRow> {
    const [row] = await this.db.insert(hiringDecisions).values(input as any).returning();
    return row as HiringDecisionRow;
  }
}
