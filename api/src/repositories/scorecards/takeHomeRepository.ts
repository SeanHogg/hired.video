/** Take-home assignments + candidate submissions persistence (#1386, #1438). */

import { desc, eq } from "drizzle-orm";
import { schema } from "../../db/index.js";
import type { ITakeHomeRepository } from "./interfaces.js";
import type {
  DbLike,
  NewTakeHomeAssignment,
  NewTakeHomeSubmission,
  TakeHomeAssignmentRow,
  TakeHomeSubmissionRow,
  UpdateTakeHomeSubmissionPatch,
} from "./types.js";

const { takeHomeAssignments, takeHomeSubmissions } = schema;

export class TakeHomeRepository implements ITakeHomeRepository {
  constructor(
    private readonly db: DbLike,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async findTakeHomeForStage(
    kitStageId: string,
  ): Promise<TakeHomeAssignmentRow | null> {
    const [row] = await this.db
      .select()
      .from(takeHomeAssignments)
      .where(eq(takeHomeAssignments.kitStageId, kitStageId))
      .limit(1);
    return (row as TakeHomeAssignmentRow) ?? null;
  }

  async upsertTakeHomeAssignment(
    input: NewTakeHomeAssignment,
  ): Promise<TakeHomeAssignmentRow> {
    const existing = await this.findTakeHomeForStage(input.kitStageId);
    if (existing) {
      const [row] = await this.db
        .update(takeHomeAssignments)
        .set({
          prompt: input.prompt,
          deliveryFormat: input.deliveryFormat ?? existing.deliveryFormat,
          dueInHours: input.dueInHours ?? existing.dueInHours,
          updatedAt: this.now(),
        } as any)
        .where(eq(takeHomeAssignments.id, existing.id))
        .returning();
      return row as TakeHomeAssignmentRow;
    }
    const [row] = await this.db
      .insert(takeHomeAssignments)
      .values(input as any)
      .returning();
    return row as TakeHomeAssignmentRow;
  }

  async findTakeHomeById(id: string): Promise<TakeHomeAssignmentRow | null> {
    const [row] = await this.db
      .select()
      .from(takeHomeAssignments)
      .where(eq(takeHomeAssignments.id, id))
      .limit(1);
    return (row as TakeHomeAssignmentRow) ?? null;
  }

  async insertTakeHomeSubmission(
    input: NewTakeHomeSubmission,
  ): Promise<TakeHomeSubmissionRow> {
    const [row] = await this.db
      .insert(takeHomeSubmissions)
      .values(input as any)
      .returning();
    return row as TakeHomeSubmissionRow;
  }

  async findTakeHomeSubmissionByToken(
    token: string,
  ): Promise<TakeHomeSubmissionRow | null> {
    const [row] = await this.db
      .select()
      .from(takeHomeSubmissions)
      .where(eq(takeHomeSubmissions.inviteToken, token))
      .limit(1);
    return (row as TakeHomeSubmissionRow) ?? null;
  }

  async findTakeHomeSubmissionById(
    id: string,
  ): Promise<TakeHomeSubmissionRow | null> {
    const [row] = await this.db
      .select()
      .from(takeHomeSubmissions)
      .where(eq(takeHomeSubmissions.id, id))
      .limit(1);
    return (row as TakeHomeSubmissionRow) ?? null;
  }

  async findTakeHomeSubmissionsForAssignment(
    assignmentId: string,
  ): Promise<TakeHomeSubmissionRow[]> {
    return (await this.db
      .select()
      .from(takeHomeSubmissions)
      .where(eq(takeHomeSubmissions.assignmentId, assignmentId))
      .orderBy(desc(takeHomeSubmissions.createdAt))) as TakeHomeSubmissionRow[];
  }

  async updateTakeHomeSubmission(
    id: string,
    patch: UpdateTakeHomeSubmissionPatch,
  ): Promise<TakeHomeSubmissionRow> {
    const [row] = await this.db
      .update(takeHomeSubmissions)
      .set(patch as any)
      .where(eq(takeHomeSubmissions.id, id))
      .returning();
    return row as TakeHomeSubmissionRow;
  }
}
