/**
 * Persistence for self-serve mock-interview practice: `interview_sessions`
 * and their per-question `interview_answers` (one aggregate). Distinct from
 * interviewAssignmentsRepository (recruiter-assigned async interviews).
 * Every function takes the caller's `db` so services/interview/practice-*.ts
 * own the connection.
 */
import { and, desc, eq } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { interviewSessions, interviewAnswers } = schema;

export type InterviewSessionRow = typeof interviewSessions.$inferSelect;
export type InterviewSessionInsert = typeof interviewSessions.$inferInsert;
export type InterviewSessionPatch = Partial<Omit<InterviewSessionInsert, "id" | "userId" | "createdAt">>;
export type InterviewAnswerRow = typeof interviewAnswers.$inferSelect;
export type InterviewAnswerInsert = typeof interviewAnswers.$inferInsert;
export type InterviewAnswerPatch = Partial<Omit<InterviewAnswerInsert, "id" | "sessionId" | "userId" | "createdAt">>;

/** Sanitised answer projection for the public share view. */
export interface PublicInterviewAnswerRow {
  question: string;
  score: string | null;
  feedback: unknown;
}

// ─── Sessions ───────────────────────────────────────────────────────────────

export async function insertInterviewSession(db: Db, values: InterviewSessionInsert): Promise<InterviewSessionRow> {
  const [row] = await db.insert(interviewSessions).values(values).returning();
  return row;
}

export async function listInterviewSessionsForUser(db: Db, userId: string): Promise<InterviewSessionRow[]> {
  return db
    .select()
    .from(interviewSessions)
    .where(eq(interviewSessions.userId, userId))
    .orderBy(desc(interviewSessions.createdAt));
}

/** The session only when `userId` owns it. */
export async function findInterviewSessionForUser(
  db: Db,
  id: string,
  userId: string,
): Promise<InterviewSessionRow | null> {
  const [row] = await db
    .select()
    .from(interviewSessions)
    .where(and(eq(interviewSessions.id, id), eq(interviewSessions.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** A session that its owner has shared publicly under `shareToken`. */
export async function findSharedInterviewSession(db: Db, shareToken: string): Promise<InterviewSessionRow | null> {
  const [row] = await db
    .select()
    .from(interviewSessions)
    .where(and(eq(interviewSessions.shareToken, shareToken), eq(interviewSessions.isShared, true)))
    .limit(1);
  return row ?? null;
}

export async function updateInterviewSession(
  db: Db,
  id: string,
  patch: InterviewSessionPatch,
): Promise<InterviewSessionRow | undefined> {
  const [row] = await db
    .update(interviewSessions)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(interviewSessions.id, id))
    .returning();
  return row;
}

/** Deletes the session's answers, then the session (two statements, as before). */
export async function deleteInterviewSessionWithAnswers(db: Db, id: string): Promise<void> {
  await db.delete(interviewAnswers).where(eq(interviewAnswers.sessionId, id));
  await db.delete(interviewSessions).where(eq(interviewSessions.id, id));
}

// ─── Answers ────────────────────────────────────────────────────────────────

export async function insertInterviewAnswer(db: Db, values: InterviewAnswerInsert): Promise<InterviewAnswerRow> {
  const [row] = await db.insert(interviewAnswers).values(values).returning();
  return row;
}

export async function listInterviewAnswersForSession(db: Db, sessionId: string): Promise<InterviewAnswerRow[]> {
  return db.select().from(interviewAnswers).where(eq(interviewAnswers.sessionId, sessionId));
}

export async function listPublicInterviewAnswers(db: Db, sessionId: string): Promise<PublicInterviewAnswerRow[]> {
  return db
    .select({
      question: interviewAnswers.question,
      score: interviewAnswers.score,
      feedback: interviewAnswers.feedback,
    })
    .from(interviewAnswers)
    .where(eq(interviewAnswers.sessionId, sessionId));
}

/** The answer only when `userId` recorded it. */
export async function findInterviewAnswerForUser(
  db: Db,
  id: string,
  userId: string,
): Promise<InterviewAnswerRow | null> {
  const [row] = await db
    .select()
    .from(interviewAnswers)
    .where(and(eq(interviewAnswers.id, id), eq(interviewAnswers.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function updateInterviewAnswer(
  db: Db,
  id: string,
  patch: InterviewAnswerPatch,
): Promise<InterviewAnswerRow | undefined> {
  const [row] = await db.update(interviewAnswers).set(patch).where(eq(interviewAnswers.id, id)).returning();
  return row;
}
