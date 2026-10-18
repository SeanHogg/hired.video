/** Debrief aggregation + hiring-decision use cases. */

import type {
  HiringDecisionRow,
  IHiringDecisionsRepository,
  IScorecardSubmissionsRepository,
  IScorecardTemplatesRepository,
} from "../../repositories/scorecardsRepository.js";
import type { CreateDecisionInput } from "./schemas.js";
import type { ScorecardsCtx } from "./context.js";
import type { Debrief } from "./results.js";
import { ServiceError } from "./errors.js";
import { assertCompanyAccess, findAccessibleTemplates } from "./access.js";
import { buildAggregateSnapshot, buildAttributeAverages } from "./scoring.js";

export type DebriefCtx = ScorecardsCtx<
  IScorecardSubmissionsRepository & IScorecardTemplatesRepository
>;
export type DecisionsCtx = ScorecardsCtx<
  IScorecardSubmissionsRepository & IHiringDecisionsRepository
>;

export async function getDebrief(ctx: DebriefCtx, userId: string, applicationId: string): Promise<Debrief> {
  const subs = await ctx.repo.findSubmittedForApplication(applicationId);
  if (subs.length === 0) {
    return {
      submissions: [],
      avgScore: null,
      recommendations: {},
      attributes: [],
    };
  }
  const templateIds = Array.from(new Set(subs.map((s) => s.templateId)));
  const authorised = (await findAccessibleTemplates(ctx, userId, templateIds)).length > 0;
  if (!authorised) {
    throw new ServiceError("FORBIDDEN", "No access to this debrief");
  }

  const subIds = subs.map((s) => s.id);
  const ratings = await ctx.repo.findRatingsForSubmissions(subIds);
  const attrs = await ctx.repo.findAttributesForTemplates(templateIds);
  const snapshot = buildAggregateSnapshot(subs);
  const attrAvgs = buildAttributeAverages(
    attrs.map((a) => ({ id: a.id, name: a.name })),
    ratings.map((r) => ({ attributeId: r.attributeId, rating: r.rating })),
  );
  return {
    submissions: subs,
    avgScore: snapshot.avgScore,
    recommendations: snapshot.recommendations,
    attributes: attrAvgs,
  };
}

export async function listDecisions(
  ctx: DecisionsCtx,
  userId: string,
  applicationId: string,
): Promise<HiringDecisionRow[]> {
  const companyIds = await ctx.getCompanyIdsForUser(userId);
  return ctx.repo.findDecisionsForApplication(applicationId, companyIds);
}

export async function createDecision(
  ctx: DecisionsCtx,
  userId: string,
  input: CreateDecisionInput,
): Promise<HiringDecisionRow> {
  await assertCompanyAccess(ctx, userId, input.companyId);
  const submitted = await ctx.repo.findSubmittedForApplication(
    input.applicationId,
  );
  const aggregateSnapshot = buildAggregateSnapshot(submitted);
  return ctx.repo.insertDecision({
    companyId: input.companyId,
    jobId: input.jobId,
    applicationId: input.applicationId,
    candidateUserId: input.candidateUserId,
    decidedByUserId: userId,
    decision: input.decision,
    reason: input.reason,
    aggregateSnapshot,
  });
}
