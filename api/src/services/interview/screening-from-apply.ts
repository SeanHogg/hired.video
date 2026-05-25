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

import { eq } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { schema } from "../../db/index.js";

const { jobItems, interviewQuestionSets, studioAsyncInterviews } = schema;

function randomToken(byteLength = 24): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

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
  const inviteToken = randomToken(24);

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

  // 3. Bump set.useCount — cheap usage analytics for the library UI.
  await db
    .update(interviewQuestionSets)
    .set({ useCount: (set.useCount ?? 0) + 1, updatedAt: new Date() } as any)
    .where(eq(interviewQuestionSets.id, set.id));

  return {
    interviewId: created!.id,
    inviteToken,
    screeningRequired: job.screeningRequired === "required" ? "required" : "optional",
  };
}
