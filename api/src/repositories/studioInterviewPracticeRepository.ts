/**
 * Interview practice — the question library (`studio_interview_questions`)
 * and a user's practice sessions (`studio_interview_sessions`).
 */
import { and, desc, eq, inArray, type SQL } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { studioInterviewQuestions, studioInterviewSessions } = schema;

export type InterviewQuestionRow = typeof studioInterviewQuestions.$inferSelect;
export type InterviewSessionRow = typeof studioInterviewSessions.$inferSelect;
export type InterviewSessionInsert = typeof studioInterviewSessions.$inferInsert;
export type InterviewSessionPatch = Partial<
  Pick<InterviewSessionInsert, "recordingId" | "coachingId" | "answer" | "isPublic" | "aiScore" | "aiFeedback">
>;

export type InterviewQuestionSeed = Omit<
  typeof studioInterviewQuestions.$inferInsert,
  "id" | "createdAt" | "isDefault"
>;

export interface InterviewQuestionFilter {
  category?: string;
  difficulty?: string;
  industry?: string;
}

const QUESTION_LIST_LIMIT = 50;
const SESSION_LIST_LIMIT = 50;

export function createStudioInterviewPracticeRepository(db: Db) {
  return {
    async listQuestions(filter: InterviewQuestionFilter): Promise<InterviewQuestionRow[]> {
      const conditions: SQL[] = [];
      if (filter.category) conditions.push(eq(studioInterviewQuestions.category, filter.category));
      if (filter.difficulty) conditions.push(eq(studioInterviewQuestions.difficulty, filter.difficulty));
      if (filter.industry) conditions.push(eq(studioInterviewQuestions.industry, filter.industry));
      let query = db.select().from(studioInterviewQuestions).$dynamic();
      if (conditions.length > 0) query = query.where(and(...conditions));
      return query.limit(QUESTION_LIST_LIMIT);
    },

    async findQuestionById(id: string): Promise<InterviewQuestionRow | null> {
      const [row] = await db
        .select()
        .from(studioInterviewQuestions)
        .where(eq(studioInterviewQuestions.id, id))
        .limit(1);
      return row ?? null;
    },

    /** Seed system-default questions in ONE multi-row insert, skipping any
     *  default whose text is already stored (the table has no natural unique
     *  key, so a re-seed would otherwise duplicate the whole library). */
    async insertDefaultQuestions(questions: readonly InterviewQuestionSeed[]): Promise<void> {
      if (questions.length === 0) return;
      const existing = await db
        .select({ question: studioInterviewQuestions.question })
        .from(studioInterviewQuestions)
        .where(and(
          eq(studioInterviewQuestions.isDefault, true),
          inArray(studioInterviewQuestions.question, questions.map((q) => q.question)),
        ));
      const stored = new Set(existing.map((r) => r.question));
      const missing = questions.filter((q) => !stored.has(q.question));
      if (missing.length === 0) return;
      await db
        .insert(studioInterviewQuestions)
        .values(missing.map((q) => ({ ...q, isDefault: true })))
        .onConflictDoNothing();
    },

    async insertSession(values: InterviewSessionInsert): Promise<InterviewSessionRow> {
      const [row] = await db.insert(studioInterviewSessions).values(values).returning();
      return row;
    },

    /** Patch the session only when `userId` owns it; null otherwise. */
    async updateOwnSession(
      id: string,
      userId: string,
      patch: InterviewSessionPatch,
    ): Promise<InterviewSessionRow | null> {
      const [row] = await db
        .update(studioInterviewSessions)
        .set(patch)
        .where(and(eq(studioInterviewSessions.id, id), eq(studioInterviewSessions.userId, userId)))
        .returning();
      return row ?? null;
    },

    async updateSessionScore(id: string, aiScore: number, aiFeedback: unknown): Promise<void> {
      await db
        .update(studioInterviewSessions)
        .set({ aiScore, aiFeedback })
        .where(eq(studioInterviewSessions.id, id));
    },

    async listSessionsForUser(userId: string): Promise<InterviewSessionRow[]> {
      return db
        .select()
        .from(studioInterviewSessions)
        .where(eq(studioInterviewSessions.userId, userId))
        .orderBy(desc(studioInterviewSessions.createdAt))
        .limit(SESSION_LIST_LIMIT);
    },
  };
}

export type StudioInterviewPracticeRepository = ReturnType<typeof createStudioInterviewPracticeRepository>;
