/** Interviewer SLA use cases: reliability stats (#1434) + assignments (#1435). */

import type {
  IScorecardSlaRepository,
  IScorecardSubmissionsRepository,
  IScorecardTemplatesRepository,
  InterviewerReliability,
  ScorecardSubmissionRow,
} from "../../repositories/scorecardsRepository.js";
import type { ScorecardsCtx } from "./context.js";
import { ServiceError } from "./errors.js";
import { loadTemplate } from "./access.js";

export type ReliabilityCtx = ScorecardsCtx<IScorecardSlaRepository>;
export type AssignmentCtx = ScorecardsCtx<
  IScorecardSubmissionsRepository & IScorecardTemplatesRepository
>;

/**
 * Caller may read their OWN reliability without extra checks (every
 * interviewer can see their own stats). To read someone else's stats,
 * the caller must share at least one company scope with the target —
 * we already trust company-scope as the visibility boundary for the
 * rest of the scorecards aggregate.
 */
export async function getReliability(
  ctx: ReliabilityCtx,
  userId: string,
  targetUserId: string,
  now: Date = ctx.now(),
): Promise<InterviewerReliability> {
  if (userId !== targetUserId) {
    const callerScopes = await ctx.getCompanyIdsForUser(userId);
    const targetScopes = await ctx.getCompanyIdsForUser(targetUserId);
    const shared = callerScopes.some((c) => targetScopes.includes(c));
    if (!shared) {
      throw new ServiceError(
        "FORBIDDEN",
        "No shared workspace with this user",
      );
    }
  }
  return ctx.repo.findReliabilityForUser(targetUserId, now);
}

/**
 * Recruiter-initiated assignment: pre-creates a draft submission keyed
 * to (templateId, applicationId, evaluatorUserId) with the SLA `dueAt`.
 * The evaluator's later `ScorecardSubmissionForm.ensureSubmission` then
 * matches this draft by querying `listSubmissions({ applicationId })`
 * and resuming it instead of creating a new row.
 *
 * Idempotent against (applicationId, evaluatorUserId, templateId): if a
 * draft already exists, the dueAt is updated and the existing row is
 * returned (no duplicate drafts).
 */
export async function assignSubmission(
  ctx: AssignmentCtx,
  userId: string,
  input: {
    templateId: string;
    applicationId: string;
    evaluatorUserId: string;
    kitStageId?: string;
    candidateUserId?: string;
    dueAt: Date;
  },
): Promise<ScorecardSubmissionRow> {
  const tpl = await loadTemplate(ctx, userId, input.templateId);
  const existing = await ctx.repo.findSubmissionsForApplication(
    input.applicationId,
  );
  const match = existing.find(
    (s) =>
      s.templateId === input.templateId &&
      s.evaluatorUserId === input.evaluatorUserId &&
      s.status === "draft",
  );
  if (match) {
    return ctx.repo.updateSubmission(match.id, { dueAt: input.dueAt });
  }
  return ctx.repo.insertSubmission({
    templateId: input.templateId,
    applicationId: input.applicationId,
    evaluatorUserId: input.evaluatorUserId,
    kitStageId: input.kitStageId,
    candidateUserId: input.candidateUserId,
    status: "draft",
    dueAt: input.dueAt,
  });
}
