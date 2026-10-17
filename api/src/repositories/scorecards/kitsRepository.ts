/** Interview kits + kit stages persistence. */

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { schema } from "../../db/index.js";
import type { IInterviewKitsRepository } from "./interfaces.js";
import type {
  DbLike,
  InterviewKitRow,
  InterviewKitStageRow,
  NewInterviewKit,
  NewInterviewKitStage,
  UpdateKitPatch,
  UpdateStagePatch,
} from "./types.js";

const { interviewKits, interviewKitStages } = schema;

export class InterviewKitsRepository implements IInterviewKitsRepository {
  constructor(
    private readonly db: DbLike,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async findKitById(id: string): Promise<InterviewKitRow | null> {
    const [row] = await this.db
      .select()
      .from(interviewKits)
      .where(eq(interviewKits.id, id))
      .limit(1);
    return (row as InterviewKitRow) ?? null;
  }

  async findKitsByIds(ids: readonly string[]): Promise<InterviewKitRow[]> {
    if (ids.length === 0) return [];
    return (await this.db
      .select()
      .from(interviewKits)
      .where(inArray(interviewKits.id, ids as string[]))) as InterviewKitRow[];
  }

  async findActiveKits(filter: {
    companyIds: readonly string[];
    jobId?: string;
    onlyCompanyId?: string;
  }): Promise<InterviewKitRow[]> {
    if (filter.companyIds.length === 0) return [];
    const companyClause = filter.onlyCompanyId
      ? eq(interviewKits.companyId, filter.onlyCompanyId)
      : inArray(interviewKits.companyId, filter.companyIds as string[]);
    const where = and(
      companyClause,
      eq(interviewKits.isArchived, false),
      filter.jobId ? eq(interviewKits.jobId, filter.jobId) : undefined,
    );
    return (await this.db
      .select()
      .from(interviewKits)
      .where(where)
      .orderBy(desc(interviewKits.updatedAt))) as InterviewKitRow[];
  }

  async insertKit(input: NewInterviewKit): Promise<InterviewKitRow> {
    const [row] = await this.db.insert(interviewKits).values(input as any).returning();
    return row as InterviewKitRow;
  }

  async updateKit(id: string, patch: UpdateKitPatch): Promise<InterviewKitRow> {
    const [row] = await this.db
      .update(interviewKits)
      .set({ ...patch, updatedAt: this.now() } as any)
      .where(eq(interviewKits.id, id))
      .returning();
    return row as InterviewKitRow;
  }

  async findStagesForKit(kitId: string): Promise<InterviewKitStageRow[]> {
    return (await this.db
      .select()
      .from(interviewKitStages)
      .where(eq(interviewKitStages.kitId, kitId))
      .orderBy(asc(interviewKitStages.displayOrder))) as InterviewKitStageRow[];
  }

  async findStageById(id: string): Promise<InterviewKitStageRow | null> {
    const [row] = await this.db
      .select()
      .from(interviewKitStages)
      .where(eq(interviewKitStages.id, id))
      .limit(1);
    return (row as InterviewKitStageRow) ?? null;
  }

  async findStagesByIds(ids: readonly string[]): Promise<InterviewKitStageRow[]> {
    if (ids.length === 0) return [];
    return (await this.db
      .select()
      .from(interviewKitStages)
      .where(inArray(interviewKitStages.id, ids as string[]))) as InterviewKitStageRow[];
  }

  async insertStage(input: NewInterviewKitStage): Promise<InterviewKitStageRow> {
    const [row] = await this.db.insert(interviewKitStages).values(input as any).returning();
    return row as InterviewKitStageRow;
  }

  async insertStages(
    rows: readonly NewInterviewKitStage[],
  ): Promise<InterviewKitStageRow[]> {
    if (rows.length === 0) return [];
    return (await this.db
      .insert(interviewKitStages)
      .values(rows as any)
      .returning()) as InterviewKitStageRow[];
  }

  async updateStage(id: string, patch: UpdateStagePatch): Promise<InterviewKitStageRow> {
    const [row] = await this.db
      .update(interviewKitStages)
      .set(patch as any)
      .where(eq(interviewKitStages.id, id))
      .returning();
    return row as InterviewKitStageRow;
  }

  async deleteStage(id: string): Promise<void> {
    await this.db.delete(interviewKitStages).where(eq(interviewKitStages.id, id));
  }
}
