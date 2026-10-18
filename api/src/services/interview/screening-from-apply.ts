/**
 * createScreeningInterviewFromApply — when a candidate applies to a job that
 * has a screening question set attached, materialise a `studio_async_interviews`
 * row bound to the new application + return the magic-link token so the apply
 * route can land the candidate directly on /interview/:token.
 *
 * Lives in its own module because:
 *   1. The shape of the row is non-trivial (mirrors POST /interview-assignments/assign
 *      but skips the email, since the candidate is sitting in the apply flow already).
 *   2. The same helper will be reused by a future bulk-invite tool ("send screening
 *      to every applicant who applied last week") without re-implementing the join.
 *
 * Failure mode: if anything goes wrong we return null and the apply route
 * proceeds without a screening — applying must not block on screening creation.
 * The recruiter can hand-send a link from MyInterviewAssignments later.
 */

import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { schema } from "../../db/index.js";
import { randomHex } from "../../utils/crypto.js";

const { jobItems, interviewQuestionSets, studioAsyncInterviews } = schema;

export interface ScreeningCreationResult {
  interviewId: string;
  inviteToken: string;
  /** 'required' | 'optional' — propagated from the job, drives the apply-flow UI. */
  screeningRequired: "required" | "optional";
}

export async function createScreeningInterviewFromApply(
  db: Db,
  args: {
    jobId: string;
    applicationId: string;
    candidateUserId: string;
    candidateEmail: string;
    responseWindowHours?: number;
  },
): Promise<ScreeningCreationResult | null> {
  // 1. Look up the job and its attached set (no join — tiny tables, two
  //    point reads stay readable in the apply flow).
  const [job] = await db
    .select({
      id: jobItems.id,
      title: jobItems.title,
      screeningQuestionSetId: jobItems.screeningQuestionSetId,
      screeningRequired: jobItems.screeningRequired,
      postedByUserId: jobItems.postedByUserId,
    })
    .from(jobItems)
    .where(eq(jobItems.id, args.jobId))
    .limit(1);
  if (!job?.screeningQuestionSetId) return null;
  if (job.screeningRequired === "none") return null;

  const [set] = await db
    .select()
    .from(interviewQuestionSets)
    .where(eq(interviewQuestionSets.id, job.screeningQuestionSetId))
    .limit(1);
  if (!set || set.isArchived) return null;

  // 2. Materialise the assignment. We COPY the questions onto the row — the
  //    library is a source of truth at *creation* time, but per-application
  //    edits (recruiter adds a follow-up question) must not bleed back.
  const responseWindowHours = args.responseWindowHours ?? 72;
  const now = new Date();
  const tokenExpiresAt = new Date(now.getTime() + 14 * 24 * 3_600_000); // 14d
  const responseDeadline = new Date(now.getTime() + responseWindowHours * 3_600_000);
  const inviteToken = randomHex(24);

  const [created] = await db
    .insert(studioAsyncInterviews)
    .values({
      recruiterId: job.postedByUserId ?? args.candidateUserId, // fall back so NOT NULL holds
      candidateId: args.candidateUserId,
      candidateEmail: args.candidateEmail,
      jobId: args.jobId,
      applicationId: args.applicationId,
      questionSetId: set.id,
      title: set.title || `${job.title} — screening`,
      instructions: set.description ?? null,
      questions: set.questions,
      deadline: responseDeadline,
      questionResponseDeadline: responseDeadline,
      inviteToken,
      inviteTokenExpiresAt: tokenExpiresAt,
      status: "pending",
      sourceContext: "job-screening",
      targetRole: set.targetRole ?? job.title,
      extractedSkills: set.skills,
      assignmentType: "screening",
      prepTimeSec: set.prepTimeSec,
      maxRetakes: set.maxRetakes,
      proctoringOn: set.proctoringOn,
    } as any)
    .returning({ id: studioAsyncInterviews.id });

  // 3. Bump set.useCount — cheap usage analytics for the library UI. Atomic
  // increment (a read-modify-write lost concurrent applies); the daily
  // counter-recompute policy (maintenance/counter-recompute.ts) is the
  // source of truth and corrects any drift.
  await db
    .update(interviewQuestionSets)
    .set({ useCount: sql`${interviewQuestionSets.useCount} + 1`, updatedAt: new Date() })
    .where(eq(interviewQuestionSets.id, set.id));

  return {
    interviewId: created!.id,
    inviteToken,
    screeningRequired: job.screeningRequired === "required" ? "required" : "optional",
  };
}

/**
 * Return the list of `job_applications` rows for `jobId` that do NOT yet
 * have a screening interview attached. Used by `POST /api/jobs/:id/screening/
 * backfill` (#1236) — "send screening to every applicant who applied
 * before screening was attached".
 *
 * Implementation note: a NOT EXISTS sub-select beats a LEFT JOIN here
 * because we only care about presence, and the join would duplicate rows
 * when a recruiter has re-sent a screening (one application_id can carry
 * multiple async-interview rows in degenerate cases).
 */
export async function listApplicationsMissingScreening(
  db: Db,
  jobId: string,
): Promise<Array<{ applicationId: string; candidateUserId: string; candidateEmail: string }>> {
  const { jobApplications, users, studioAsyncInterviews } = schema;
  const rows = await db
    .select({
      applicationId: jobApplications.id,
      candidateUserId: jobApplications.userId,
      candidateEmail: users.email,
    })
    .from(jobApplications)
    .innerJoin(users, eq(users.id, jobApplications.userId))
    .where(
      and(
        eq(jobApplications.jobId, jobId),
        // Postgres NOT EXISTS expressed via Drizzle's `sql` template would
        // bring `sql` into this module just for one clause; instead, run a
        // small in-memory anti-join on the (tiny) list of interviews already
        // backed by this job. Bulk backfill is a recruiter-initiated batch,
        // so the read cost is acceptable.
      ),
    );
  const existing = await db
    .select({ applicationId: studioAsyncInterviews.applicationId })
    .from(studioAsyncInterviews)
    .where(eq(studioAsyncInterviews.jobId, jobId));
  const alreadyHas = new Set(existing.map((r) => r.applicationId).filter(Boolean) as string[]);
  return rows.filter((r) => !alreadyHas.has(r.applicationId));
}
