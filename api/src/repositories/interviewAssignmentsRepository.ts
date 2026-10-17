/**
 * Persistence for interview assignments (`studio_async_interviews`) and
 * their per-question answers (`studio_async_responses`), plus the two
 * point reads/writes on neighbouring tables the assignment flow needs
 * (candidate lookup on `users`, decision propagation onto
 * `job_applications`).
 *
 * Every function takes the caller's `db` so the use cases in
 * services/interview/assignment-*.ts own the connection.
 */
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { studioAsyncInterviews, studioAsyncResponses, users, jobApplications } = schema;

export type InterviewAssignmentRow = typeof studioAsyncInterviews.$inferSelect;
export type InterviewAssignmentInsert = typeof studioAsyncInterviews.$inferInsert;
export type InterviewAssignmentPatch = Partial<Omit<InterviewAssignmentInsert, "id" | "resendCount">>;
export type InterviewResponseRow = typeof studioAsyncResponses.$inferSelect;
export type InterviewResponseInsert = typeof studioAsyncResponses.$inferInsert;
export type InterviewResponsePatch = Partial<Omit<InterviewResponseInsert, "id">>;

/** Hard cap on the "mine" lists (creator side and candidate side). */
const MINE_LIST_LIMIT = 100;

// ─── Interviews ─────────────────────────────────────────────────────────────

export async function findInterviewById(db: Db, id: string): Promise<InterviewAssignmentRow | null> {
  const [row] = await db.select().from(studioAsyncInterviews).where(eq(studioAsyncInterviews.id, id)).limit(1);
  return row ?? null;
}

/** The interview only when `recruiterId` created it. */
export async function findInterviewForCreator(
  db: Db,
  id: string,
  recruiterId: string,
): Promise<InterviewAssignmentRow | null> {
  const [row] = await db
    .select()
    .from(studioAsyncInterviews)
    .where(and(eq(studioAsyncInterviews.id, id), eq(studioAsyncInterviews.recruiterId, recruiterId)))
    .limit(1);
  return row ?? null;
}

export async function findInterviewByInviteToken(db: Db, token: string): Promise<InterviewAssignmentRow | null> {
  const [row] = await db
    .select()
    .from(studioAsyncInterviews)
    .where(eq(studioAsyncInterviews.inviteToken, token))
    .limit(1);
  return row ?? null;
}

export async function findInterviewsForCreator(
  db: Db,
  ids: string[],
  recruiterId: string,
): Promise<InterviewAssignmentRow[]> {
  return db
    .select()
    .from(studioAsyncInterviews)
    .where(and(eq(studioAsyncInterviews.recruiterId, recruiterId), inArray(studioAsyncInterviews.id, ids)));
}

export async function listInterviewsCreatedBy(db: Db, recruiterId: string): Promise<InterviewAssignmentRow[]> {
  return db
    .select()
    .from(studioAsyncInterviews)
    .where(eq(studioAsyncInterviews.recruiterId, recruiterId))
    .orderBy(desc(studioAsyncInterviews.createdAt))
    .limit(MINE_LIST_LIMIT);
}

/** Bound to the candidate, or addressed to their email and not yet claimed. */
export async function listInterviewsAssignedTo(
  db: Db,
  candidateId: string,
  email: string,
): Promise<InterviewAssignmentRow[]> {
  return db
    .select()
    .from(studioAsyncInterviews)
    .where(
      or(
        eq(studioAsyncInterviews.candidateId, candidateId),
        and(eq(studioAsyncInterviews.candidateEmail, email), isNull(studioAsyncInterviews.candidateId)),
      ),
    )
    .orderBy(desc(studioAsyncInterviews.createdAt))
    .limit(MINE_LIST_LIMIT);
}

export async function insertInterview(db: Db, values: InterviewAssignmentInsert): Promise<InterviewAssignmentRow> {
  const [row] = await db.insert(studioAsyncInterviews).values(values).returning();
  return row;
}

export async function updateInterview(
  db: Db,
  id: string,
  patch: InterviewAssignmentPatch,
): Promise<InterviewAssignmentRow | null> {
  const [row] = await db
    .update(studioAsyncInterviews)
    .set(patch)
    .where(eq(studioAsyncInterviews.id, id))
    .returning();
  return row ?? null;
}

/** Swap in a fresh magic-link token and bump `resend_count` atomically. */
export async function rotateInviteToken(
  db: Db,
  id: string,
  args: { token: string; expiresAt: Date; status: string },
): Promise<InterviewAssignmentRow | null> {
  const now = new Date();
  const [row] = await db
    .update(studioAsyncInterviews)
    .set({
      inviteToken: args.token,
      inviteTokenExpiresAt: args.expiresAt,
      resendCount: sql`${studioAsyncInterviews.resendCount} + 1`,
      lastResentAt: now,
      updatedAt: now,
      status: args.status,
    })
    .where(eq(studioAsyncInterviews.id, id))
    .returning();
  return row ?? null;
}

// ─── Responses ──────────────────────────────────────────────────────────────

export async function listResponsesForInterview(
  db: Db,
  interviewId: string,
  opts: { ordered?: boolean } = {},
): Promise<InterviewResponseRow[]> {
  const where = eq(studioAsyncResponses.interviewId, interviewId);
  if (opts.ordered) {
    return db.select().from(studioAsyncResponses).where(where).orderBy(studioAsyncResponses.createdAt);
  }
  return db.select().from(studioAsyncResponses).where(where);
}

export async function listResponsesForInterviews(db: Db, interviewIds: string[]): Promise<InterviewResponseRow[]> {
  return db.select().from(studioAsyncResponses).where(inArray(studioAsyncResponses.interviewId, interviewIds));
}

export async function findResponseOnInterview(
  db: Db,
  interviewId: string,
  responseId: string,
): Promise<InterviewResponseRow | null> {
  const [row] = await db
    .select()
    .from(studioAsyncResponses)
    .where(and(eq(studioAsyncResponses.id, responseId), eq(studioAsyncResponses.interviewId, interviewId)))
    .limit(1);
  return row ?? null;
}

/** The candidate's existing answer to one question (re-record target). */
export async function findCandidateAnswer(
  db: Db,
  args: { interviewId: string; candidateId: string; questionId: string },
): Promise<InterviewResponseRow | null> {
  const [row] = await db
    .select()
    .from(studioAsyncResponses)
    .where(
      and(
        eq(studioAsyncResponses.interviewId, args.interviewId),
        eq(studioAsyncResponses.candidateId, args.candidateId),
        eq(studioAsyncResponses.questionId, args.questionId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function insertResponse(db: Db, values: InterviewResponseInsert): Promise<InterviewResponseRow> {
  const [row] = await db.insert(studioAsyncResponses).values(values).returning();
  return row;
}

export async function updateResponse(
  db: Db,
  id: string,
  patch: InterviewResponsePatch,
): Promise<InterviewResponseRow | null> {
  const [row] = await db
    .update(studioAsyncResponses)
    .set(patch)
    .where(eq(studioAsyncResponses.id, id))
    .returning();
  return row ?? null;
}

export async function markCandidateResponsesSubmitted(
  db: Db,
  interviewId: string,
  candidateId: string,
): Promise<void> {
  await db
    .update(studioAsyncResponses)
    .set({ status: "submitted" })
    .where(and(eq(studioAsyncResponses.interviewId, interviewId), eq(studioAsyncResponses.candidateId, candidateId)));
}

// ─── Neighbouring tables ────────────────────────────────────────────────────

type UserRow = typeof users.$inferSelect;
export type CandidateLookupRow = Pick<UserRow, "id" | "role" | "name">;

export async function findUserByExactEmail(db: Db, email: string): Promise<CandidateLookupRow | null> {
  const [row] = await db
    .select({ id: users.id, role: users.role, name: users.name })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return row ?? null;
}

export type CandidateSummaryRow = Pick<UserRow, "id" | "name" | "email">;

export async function findCandidateSummary(db: Db, userId: string): Promise<CandidateSummaryRow | null> {
  const [row] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

export async function setJobApplicationStatus(db: Db, applicationId: string, status: string): Promise<void> {
  await db
    .update(jobApplications)
    .set({ status, statusChangedAt: new Date(), updatedAt: new Date() })
    .where(eq(jobApplications.id, applicationId));
}
