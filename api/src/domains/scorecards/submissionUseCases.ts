/**
 * Scorecard submission lifecycle use cases: list (blind-review + HM
 * visibility gating), read, create draft, edit draft, submit (cert gate
 * + weighted overall score).
 */

import type {
  IEvaluatorCertificationRepository,
  IInterviewKitsRepository,
  IScorecardSubmissionsRepository,
  IScorecardTemplatesRepository,
  InterviewKitRow,
  ScorecardSubmissionRow,
} from "../../repositories/scorecardsRepository.js";
import type { CreateSubmissionInput, UpdateSubmissionInput } from "./schemas.js";
import type { ScorecardsCtx } from "./context.js";
import type { SubmissionWithRatings } from "./results.js";
import { ServiceError } from "./errors.js";
import {
  findAccessibleTemplates,
  loadTemplate,
  resolveHmVisibilityForKit,
  resolveKitForSubmission,
  resolveKitsForSubmissions,
} from "./access.js";
import { computeOverallScore } from "./scoring.js";
import { filterSubmissionsForRequester, maskCandidateIdentity } from "./blindReview.js";
import { filterSubmissionsForHm } from "./hmVisibility.js";

export type SubmissionsCtx = ScorecardsCtx<
  IScorecardSubmissionsRepository &
    IScorecardTemplatesRepository &
    IInterviewKitsRepository &
    IEvaluatorCertificationRepository
>;

/**
 * List submissions for an application or interview, filtered to those
 * whose template the caller can access. We resolve via templates because
 * submissions are polymorphic in `applicationId`, but every submission
 * carries a template that's owned by a known company.
 */
export async function listSubmissions(
  ctx: SubmissionsCtx,
  userId: string,
  filter: { applicationId?: string; interviewId?: string },
): Promise<ScorecardSubmissionRow[]> {
  if (!filter.applicationId && !filter.interviewId) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "applicationId or interviewId required",
    );
  }
  const subs = filter.applicationId
    ? await ctx.repo.findSubmissionsForApplication(filter.applicationId)
    : await ctx.repo.findSubmissionsForInterview(filter.interviewId!);
  if (subs.length === 0) return [];

  // Resolve which templates the caller can read; keep submissions whose
  // template is in that set. We deliberately compute by template-id, not
  // company-id — the variable name now matches the values it holds.
  const templateIds = Array.from(new Set(subs.map((s) => s.templateId)));
  const visibleTemplateIds = new Set(
    (await findAccessibleTemplates(ctx, userId, templateIds)).map((t) => t.id),
  );
  const visible = subs.filter((s) => visibleTemplateIds.has(s.templateId));

  // Blind-review peer-hiding (#1380). Group by governing kit because
  // each kit defines its own policy; ungoverned submissions are
  // unaffected. Kits are resolved for every submission in two batched
  // reads (stages → kits), not per submission.
  const grouped = new Map<string | "_none", ScorecardSubmissionRow[]>();
  const kitCache = new Map<string, InterviewKitRow | null>();
  const kitBySubmission = await resolveKitsForSubmissions(ctx, visible);
  for (const sub of visible) {
    const kit = kitBySubmission.get(sub.id) ?? null;
    const key = kit?.id ?? "_none";
    if (kit && !kitCache.has(kit.id)) kitCache.set(kit.id, kit);
    const bucket = grouped.get(key) ?? [];
    bucket.push(sub);
    grouped.set(key, bucket);
  }
  const out: ScorecardSubmissionRow[] = [];
  for (const [key, bucket] of grouped) {
    const kit = key === "_none" ? null : kitCache.get(key) ?? null;
    const isEvaluator = bucket.some((s) => s.evaluatorUserId === userId);
    if (isEvaluator) {
      // Evaluator viewer — blind-review peer-hiding + candidate masking.
      const filtered = filterSubmissionsForRequester(bucket, kit, userId);
      out.push(
        ...filtered.map((s) => maskCandidateIdentity(s, kit, s.evaluatorUserId === userId)),
      );
    } else {
      // #241 — hiring-manager / non-evaluator viewer: the job's HM-visibility
      // mode governs whether they see the panel's scorecards.
      const mode = await resolveHmVisibilityForKit(ctx, kit);
      out.push(...filterSubmissionsForHm(bucket, mode, false));
    }
  }
  return out;
}

export async function getSubmission(ctx: SubmissionsCtx, userId: string, id: string): Promise<SubmissionWithRatings> {
  const sub = await ctx.repo.findSubmissionById(id);
  if (!sub) throw new ServiceError("NOT_FOUND", "Submission not found");
  await loadTemplate(ctx, userId, sub.templateId);
  const kit = await resolveKitForSubmission(ctx, sub);

  // #241 — a non-evaluator (HM) viewer must clear the job's visibility gate
  // before reading a single scorecard, so the detail route can't bypass the
  // list-level gating.
  if (sub.evaluatorUserId !== userId) {
    const mode = await resolveHmVisibilityForKit(ctx, kit);
    if (mode === "always_hide_hm") {
      throw new ServiceError("FORBIDDEN", "Scorecards are hidden for hiring managers on this job");
    }
    if (mode === "hide_hm_until_submit") {
      const panel = await ctx.repo.findSubmissionsForApplication(sub.applicationId);
      if (filterSubmissionsForHm(panel, mode, false).length === 0) {
        throw new ServiceError("FORBIDDEN", "Scorecards unlock once the panel completes");
      }
    }
  }

  const ratings = await ctx.repo.findRatingsForSubmission(sub.id);
  const view = maskCandidateIdentity(sub, kit, sub.evaluatorUserId === userId);
  return { ...view, ratings };
}

export async function createSubmission(
  ctx: SubmissionsCtx,
  userId: string,
  input: CreateSubmissionInput,
): Promise<ScorecardSubmissionRow> {
  await loadTemplate(ctx, userId, input.templateId);
  const sub = await ctx.repo.insertSubmission({
    templateId: input.templateId,
    interviewId: input.interviewId,
    kitStageId: input.kitStageId,
    applicationId: input.applicationId,
    candidateUserId: input.candidateUserId,
    evaluatorUserId: userId,
    overallRecommendation: input.overallRecommendation,
    summary: input.summary,
    strengths: input.strengths,
    concerns: input.concerns,
    status: "draft",
    dueAt: input.dueAt ?? null,
  });
  if (input.ratings && input.ratings.length > 0) {
    await ctx.repo.insertRatings(
      input.ratings.map((rt) => ({
        submissionId: sub.id,
        attributeId: rt.attributeId,
        rating: rt.rating ?? null,
        notes: rt.notes,
      })),
    );
  }
  return sub;
}

export async function updateSubmission(
  ctx: SubmissionsCtx,
  userId: string,
  id: string,
  patch: UpdateSubmissionInput,
): Promise<ScorecardSubmissionRow> {
  const sub = await ctx.repo.findSubmissionById(id);
  if (!sub) throw new ServiceError("NOT_FOUND", "Submission not found");
  if (sub.evaluatorUserId !== userId) {
    throw new ServiceError(
      "FORBIDDEN",
      "Only the evaluator can edit this submission",
    );
  }
  if (sub.status === "submitted") {
    throw new ServiceError(
      "CONFLICT",
      "Submitted scorecards cannot be edited",
    );
  }
  const updated = await ctx.repo.updateSubmission(id, {
    overallRecommendation: patch.overallRecommendation,
    summary: patch.summary ?? null,
    strengths: patch.strengths ?? null,
    concerns: patch.concerns ?? null,
  });
  if (patch.ratings && patch.ratings.length > 0) {
    // One multi-row upsert (was select + insert/update per rating).
    await ctx.repo.upsertRatings(
      patch.ratings.map((rt) => ({
        submissionId: id,
        attributeId: rt.attributeId,
        rating: rt.rating ?? null,
        notes: rt.notes ?? null,
      })),
    );
  }
  return updated;
}

/**
 * Finalise a draft submission. Computes the weighted overall score
 * from current ratings and locks the row by setting status=submitted.
 * #1384 cert gate: if the template requires a certification course,
 * the evaluator must hold an active, non-expired, non-revoked cert.
 */
export async function submitSubmission(
  ctx: SubmissionsCtx,
  userId: string,
  id: string,
): Promise<ScorecardSubmissionRow> {
  const sub = await ctx.repo.findSubmissionById(id);
  if (!sub) throw new ServiceError("NOT_FOUND", "Submission not found");
  if (sub.evaluatorUserId !== userId) {
    throw new ServiceError("FORBIDDEN", "Only the evaluator can submit");
  }
  if (sub.status === "submitted") {
    throw new ServiceError("CONFLICT", "Already submitted");
  }
  const tpl = await ctx.repo.findTemplateById(sub.templateId);
  if (tpl?.requiredCertificationCourseId) {
    const ok = await ctx.repo.hasActiveCertification(
      userId,
      tpl.requiredCertificationCourseId,
      ctx.now(),
    );
    if (!ok) {
      throw new ServiceError(
        "FORBIDDEN",
        "Complete the required training certification before submitting",
      );
    }
  }
  const attrs = await ctx.repo.findAttributesForTemplate(sub.templateId);
  const ratings = await ctx.repo.findRatingsForSubmission(sub.id);
  const overallScore = computeOverallScore(
    attrs.map((a) => ({ id: a.id, weight: a.weight })),
    ratings.map((r) => ({ attributeId: r.attributeId, rating: r.rating })),
    tpl?.ratingScale ?? "1-4",
  );
  return ctx.repo.updateSubmission(id, {
    status: "submitted",
    overallScore,
    submittedAt: ctx.now(),
  });
}
