/**
 * InterviewQuestionSetsRepository — the reusable interview question-set
 * library (`interview_question_sets`), owned either by a user (personal) or
 * by a company (shared). Pure data access: ownership/visibility decisions
 * live in services/interview/question-sets.ts.
 */
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";

const { interviewQuestionSets } = schema;

// `any` keeps transaction handles + test doubles assignable (same as jobsRepository's DbLike).
type DbLike = any;

export type QuestionSetRow = typeof interviewQuestionSets.$inferSelect;
export type QuestionSetInsert = typeof interviewQuestionSets.$inferInsert;
export type QuestionSetPatch = Partial<Omit<QuestionSetInsert, "id" | "ownerUserId" | "ownerCompanyId" | "ownerType" | "ownerId" | "createdAt">>;

/** Free-function form kept for the job-screening use cases that pass their own db. */
export async function findQuestionSetById(db: DbLike, id: string): Promise<QuestionSetRow | null> {
  const [row] = await db
    .select()
    .from(interviewQuestionSets)
    .where(eq(interviewQuestionSets.id, id))
    .limit(1);
  return (row as QuestionSetRow) ?? null;
}

export class InterviewQuestionSetsRepository {
  constructor(private readonly db: DbLike = getDb()) {}

  findById(id: string): Promise<QuestionSetRow | null> {
    return findQuestionSetById(this.db, id);
  }

  /** Sets owned by the user OR by any of `companyIds`, newest first (cap 200). */
  listVisible(userId: string, companyIds: string[], includeArchived: boolean): Promise<QuestionSetRow[]> {
    return this.db
      .select()
      .from(interviewQuestionSets)
      .where(
        and(
          includeArchived ? undefined : eq(interviewQuestionSets.isArchived, false),
          or(
            eq(interviewQuestionSets.ownerUserId, userId),
            companyIds.length > 0
              ? inArray(interviewQuestionSets.ownerCompanyId, companyIds)
              : isNull(interviewQuestionSets.ownerCompanyId), // never matches anything if no companies — fine
          ),
        ),
      )
      .orderBy(desc(interviewQuestionSets.updatedAt))
      .limit(200);
  }

  async insert(values: QuestionSetInsert): Promise<QuestionSetRow> {
    const [row] = await this.db.insert(interviewQuestionSets).values(values).returning();
    return row as QuestionSetRow;
  }

  /** Patches a set (stamping updatedAt); returns the updated row. */
  async update(id: string, patch: QuestionSetPatch): Promise<QuestionSetRow | null> {
    const [row] = await this.db
      .update(interviewQuestionSets)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(interviewQuestionSets.id, id))
      .returning();
    return (row as QuestionSetRow) ?? null;
  }
}
