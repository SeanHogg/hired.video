/** Stage question bank persistence (#1390). */

import { asc, eq, inArray } from "drizzle-orm";
import { schema } from "../../db/index.js";
import type { IStageQuestionsRepository } from "./interfaces.js";
import type {
  DbLike,
  NewStageQuestion,
  StageQuestionRow,
} from "./types.js";

const { interviewStageQuestions } = schema;

export class StageQuestionsRepository implements IStageQuestionsRepository {
  constructor(private readonly db: DbLike) {}

  async findQuestionsForStage(kitStageId: string): Promise<StageQuestionRow[]> {
    return (await this.db
      .select()
      .from(interviewStageQuestions)
      .where(eq(interviewStageQuestions.kitStageId, kitStageId))
      .orderBy(asc(interviewStageQuestions.displayOrder))) as StageQuestionRow[];
  }

  async findQuestionsForStages(kitStageIds: readonly string[]): Promise<StageQuestionRow[]> {
    if (kitStageIds.length === 0) return [];
    return (await this.db
      .select()
      .from(interviewStageQuestions)
      .where(inArray(interviewStageQuestions.kitStageId, kitStageIds as string[]))
      .orderBy(asc(interviewStageQuestions.displayOrder))) as StageQuestionRow[];
  }

  async findStageQuestionById(id: string): Promise<StageQuestionRow | null> {
    const [row] = await this.db
      .select()
      .from(interviewStageQuestions)
      .where(eq(interviewStageQuestions.id, id))
      .limit(1);
    return (row as StageQuestionRow) ?? null;
  }

  async insertStageQuestion(input: NewStageQuestion): Promise<StageQuestionRow> {
    const [row] = await this.db
      .insert(interviewStageQuestions)
      .values(input as any)
      .returning();
    return row as StageQuestionRow;
  }

  async deleteStageQuestion(id: string): Promise<void> {
    await this.db
      .delete(interviewStageQuestions)
      .where(eq(interviewStageQuestions.id, id));
  }
}
