/** Take-home assignment + candidate magic-link flow use cases (#1386, #1438). */

import type {
  IInterviewKitsRepository,
  IScorecardSubmissionsRepository,
  IScorecardTemplatesRepository,
  ITakeHomeRepository,
  TakeHomeAssignmentRow,
  TakeHomeSubmissionRow,
} from "../../repositories/scorecardsRepository.js";
import { randomHex } from "../../utils/crypto.js";
import type { ScorecardsCtx } from "./context.js";
import { ServiceError } from "./errors.js";
import { loadKit, loadTemplate } from "./access.js";

export type TakeHomeCtx = ScorecardsCtx<ITakeHomeRepository & IInterviewKitsRepository>;
export type TakeHomeReviewCtx = ScorecardsCtx<
  ITakeHomeRepository &
    IInterviewKitsRepository &
    IScorecardTemplatesRepository &
    IScorecardSubmissionsRepository
>;

export async function getTakeHomeForStage(ctx: TakeHomeCtx, userId: string, kitStageId: string) {
  const stage = await ctx.repo.findStageById(kitStageId);
  if (!stage) throw new ServiceError("NOT_FOUND", "Stage not found");
  await loadKit(ctx, userId, stage.kitId);
  return ctx.repo.findTakeHomeForStage(kitStageId);
}

export async function upsertTakeHome(
  ctx: TakeHomeCtx,
  userId: string,
  kitStageId: string,
  input: {
    prompt: string;
    deliveryFormat?: string;
    dueInHours?: number;
  },
) {
  const stage = await ctx.repo.findStageById(kitStageId);
  if (!stage) throw new ServiceError("NOT_FOUND", "Stage not found");
  await loadKit(ctx, userId, stage.kitId);
  return ctx.repo.upsertTakeHomeAssignment({
    kitStageId,
    prompt: input.prompt,
    deliveryFormat: input.deliveryFormat,
    dueInHours: input.dueInHours,
  });
}

/**
 * Recruiter mints a candidate invite for a take-home assignment. The
 * candidate gets a magic-link URL `/take-home/:token` that resolves to
 * the prompt + a delivery form. Idempotent over
 * (assignmentId, applicationId) — re-inviting the same candidate
 * returns the existing row rather than creating duplicates.
 */
export async function createTakeHomeInvite(
  ctx: TakeHomeCtx,
  userId: string,
  kitStageId: string,
  input: {
    applicationId: string;
    candidateUserId?: string;
  },
) {
  const stage = await ctx.repo.findStageById(kitStageId);
  if (!stage) throw new ServiceError("NOT_FOUND", "Stage not found");
  await loadKit(ctx, userId, stage.kitId);
  const assignment = await ctx.repo.findTakeHomeForStage(kitStageId);
  if (!assignment) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "Configure the take-home prompt before inviting candidates",
    );
  }
  // Idempotency over (assignment, application) — re-invite is cheap.
  const existing = await ctx.repo.findTakeHomeSubmissionsForAssignment(
    assignment.id,
  );
  const match = existing.find((s) => s.applicationId === input.applicationId);
  if (match) return match;

  // 32-byte hex magic-link token — same shape as the async-interview invite.
  const token = randomHex(32);
  const expiresAt = new Date(
    ctx.now().getTime() + assignment.dueInHours * 60 * 60 * 1000,
  );
  return ctx.repo.insertTakeHomeSubmission({
    assignmentId: assignment.id,
    applicationId: input.applicationId,
    candidateUserId: input.candidateUserId ?? null,
    inviteToken: token,
    tokenExpiresAt: expiresAt,
  });
}

/** Public-by-token preview the candidate sees on /take-home/:token. */
export async function getTakeHomeByToken(ctx: TakeHomeCtx, token: string): Promise<{
  submission: TakeHomeSubmissionRow;
  assignment: TakeHomeAssignmentRow;
  stage: { id: string; name: string };
  /** True iff the token has expired AND no delivery is recorded yet. */
  expired: boolean;
  /** True iff the candidate has already submitted. */
  alreadySubmitted: boolean;
}> {
  const submission = await ctx.repo.findTakeHomeSubmissionByToken(token);
  if (!submission) {
    throw new ServiceError("NOT_FOUND", "Invite not found");
  }
  const assignment = await ctx.repo.findTakeHomeById(submission.assignmentId);
  if (!assignment) throw new ServiceError("NOT_FOUND", "Assignment not found");
  const stage = await ctx.repo.findStageById(assignment.kitStageId);
  if (!stage) throw new ServiceError("NOT_FOUND", "Stage not found");
  const now = ctx.now();
  const expired =
    submission.tokenExpiresAt != null &&
    submission.tokenExpiresAt < now &&
    submission.submittedAt == null;
  return {
    submission,
    assignment,
    stage: { id: stage.id, name: stage.name },
    expired,
    alreadySubmitted: submission.submittedAt != null,
  };
}

/** Candidate submits their delivery via the magic-link surface. */
export async function submitTakeHomeByToken(
  ctx: TakeHomeCtx,
  token: string,
  input: {
    deliveryUrl?: string;
    textResponse?: string;
    fileRefs?: string[];
  },
): Promise<TakeHomeSubmissionRow> {
  const submission = await ctx.repo.findTakeHomeSubmissionByToken(token);
  if (!submission) {
    throw new ServiceError("NOT_FOUND", "Invite not found");
  }
  if (submission.submittedAt) {
    throw new ServiceError("CONFLICT", "Already submitted");
  }
  if (
    submission.tokenExpiresAt != null &&
    submission.tokenExpiresAt < ctx.now()
  ) {
    throw new ServiceError("CONFLICT", "Invite has expired");
  }
  if (!input.deliveryUrl && !input.textResponse && (input.fileRefs?.length ?? 0) === 0) {
    throw new ServiceError("VALIDATION_ERROR", "Provide a delivery");
  }
  return ctx.repo.updateTakeHomeSubmission(submission.id, {
    deliveryUrl: input.deliveryUrl ?? null,
    textResponse: input.textResponse ?? null,
    fileRefs: input.fileRefs ?? [],
    submittedAt: ctx.now(),
  });
}

/** Recruiter lists submissions for a take-home assignment. */
export async function listTakeHomeSubmissions(
  ctx: TakeHomeCtx,
  userId: string,
  kitStageId: string,
): Promise<TakeHomeSubmissionRow[]> {
  const stage = await ctx.repo.findStageById(kitStageId);
  if (!stage) throw new ServiceError("NOT_FOUND", "Stage not found");
  await loadKit(ctx, userId, stage.kitId);
  const assignment = await ctx.repo.findTakeHomeForStage(kitStageId);
  if (!assignment) return [];
  return ctx.repo.findTakeHomeSubmissionsForAssignment(assignment.id);
}

/**
 * Bind a scorecard submission to a take-home submission for review.
 * Lazy-creates a draft scorecard submission keyed to the same
 * applicationId so the reviewer can immediately fill it without
 * losing context. Idempotent — re-binding returns the existing link.
 */
export async function startTakeHomeReview(
  ctx: TakeHomeReviewCtx,
  userId: string,
  takeHomeSubmissionId: string,
  templateId: string,
): Promise<{
  takeHomeSubmissionId: string;
  scorecardSubmissionId: string;
}> {
  const th = await ctx.repo.findTakeHomeSubmissionById(takeHomeSubmissionId);
  if (!th) throw new ServiceError("NOT_FOUND", "Take-home submission not found");
  const assignment = await ctx.repo.findTakeHomeById(th.assignmentId);
  if (!assignment) throw new ServiceError("NOT_FOUND", "Assignment not found");
  const stage = await ctx.repo.findStageById(assignment.kitStageId);
  if (!stage) throw new ServiceError("NOT_FOUND", "Stage not found");
  await loadKit(ctx, userId, stage.kitId);

  if (th.evaluatorScorecardSubmissionId) {
    return {
      takeHomeSubmissionId: th.id,
      scorecardSubmissionId: th.evaluatorScorecardSubmissionId,
    };
  }
  await loadTemplate(ctx, userId, templateId);
  const scorecard = await ctx.repo.insertSubmission({
    templateId,
    applicationId: th.applicationId,
    evaluatorUserId: userId,
    kitStageId: stage.id,
    candidateUserId: th.candidateUserId ?? undefined,
    status: "draft",
  });
  await ctx.repo.updateTakeHomeSubmission(th.id, {
    evaluatorScorecardSubmissionId: scorecard.id,
  });
  return {
    takeHomeSubmissionId: th.id,
    scorecardSubmissionId: scorecard.id,
  };
}
