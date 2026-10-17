/**
 * Job screening repository — the interview question set a job attaches for
 * apply-time screening (`job_items.screening_question_set_id`). The job-side
 * columns are read/written through JobsRepository; this file owns only the
 * question-set lookup the job screening use cases need.
 */
import { eq } from "drizzle-orm";
import { schema } from "../db/index.js";
import type { DbLike } from "./jobsRepository.js";

export type QuestionSetRow = typeof schema.interviewQuestionSets.$inferSelect;

export async function findQuestionSetById(db: DbLike, id: string): Promise<QuestionSetRow | null> {
  const [row] = await db
    .select()
    .from(schema.interviewQuestionSets)
    .where(eq(schema.interviewQuestionSets.id, id))
    .limit(1);
  return (row as QuestionSetRow) ?? null;
}
