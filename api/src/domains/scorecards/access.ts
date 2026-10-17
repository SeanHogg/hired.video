/**
 * Shared authorization + resolution helpers for scorecards use cases:
 * company-scope gates, scoped loads of templates / kits, kit resolution
 * for submissions (blind-review policy) and HM-visibility resolution.
 */

import type {
  IInterviewKitsRepository,
  IScorecardTemplatesRepository,
  InterviewKitRow,
  ScorecardSubmissionRow,
  ScorecardTemplateRow,
} from "../../repositories/scorecardsRepository.js";
import type { ScorecardHmVisibility } from "./hmVisibility.js";
import type { CompanyAccessCtx, ScorecardsCtx } from "./context.js";
import { ServiceError } from "./errors.js";

export async function assertCompanyAccess(ctx: Pick<CompanyAccessCtx, "canAccessCompany">, userId: string, companyId: string): Promise<void> {
  if (!(await ctx.canAccessCompany(userId, companyId))) {
    throw new ServiceError("FORBIDDEN", "No access to this company");
  }
}

/** Load a template + check the caller can access its company. */
export async function loadTemplate(
  ctx: ScorecardsCtx<IScorecardTemplatesRepository>,
  userId: string,
  templateId: string,
): Promise<ScorecardTemplateRow> {
  const tpl = await ctx.repo.findTemplateById(templateId);
  if (!tpl) throw new ServiceError("NOT_FOUND", "Template not found");
  await assertCompanyAccess(ctx, userId, tpl.companyId);
  return tpl;
}

/** Load a kit + check the caller can access its company. */
export async function loadKit(ctx: ScorecardsCtx<IInterviewKitsRepository>, userId: string, kitId: string): Promise<InterviewKitRow> {
  const kit = await ctx.repo.findKitById(kitId);
  if (!kit) throw new ServiceError("NOT_FOUND", "Kit not found");
  await assertCompanyAccess(ctx, userId, kit.companyId);
  return kit;
}

/**
 * Resolve the kit that governs a submission's review policy. Submissions
 * link to a kit indirectly via `kitStageId` (optional) — submissions
 * created outside a kit return null and behave as "no blind-review
 * policy" (legacy ad-hoc scorecards keep working unchanged).
 */
export async function resolveKitForSubmission(
  ctx: ScorecardsCtx<IInterviewKitsRepository>,
  sub: Pick<ScorecardSubmissionRow, "kitStageId">,
): Promise<InterviewKitRow | null> {
  if (!sub.kitStageId) return null;
  const stage = await ctx.repo.findStageById(sub.kitStageId);
  if (!stage) return null;
  return ctx.repo.findKitById(stage.kitId);
}

export async function resolveKitsForSubmissions(
  ctx: ScorecardsCtx<IInterviewKitsRepository>,
  subs: ReadonlyArray<Pick<ScorecardSubmissionRow, "id" | "kitStageId">>,
): Promise<Map<string, InterviewKitRow | null>> {
  const stageIds = Array.from(
    new Set(subs.map((s) => s.kitStageId).filter((id): id is string => Boolean(id))),
  );
  const stages = await ctx.repo.findStagesByIds(stageIds);
  const stageById = new Map(stages.map((st) => [st.id, st]));
  const kits = await ctx.repo.findKitsByIds(Array.from(new Set(stages.map((st) => st.kitId))));
  const kitById = new Map(kits.map((k) => [k.id, k]));
  const out = new Map<string, InterviewKitRow | null>();
  for (const sub of subs) {
    const stage = sub.kitStageId ? stageById.get(sub.kitStageId) : undefined;
    out.set(sub.id, stage ? kitById.get(stage.kitId) ?? null : null);
  }
  return out;
}

export async function findAccessibleTemplates(
  ctx: ScorecardsCtx<IScorecardTemplatesRepository>,
  userId: string,
  templateIds: readonly string[],
): Promise<ScorecardTemplateRow[]> {
  if (templateIds.length === 0) return [];
  const [templates, companyIds] = await Promise.all([
    ctx.repo.findTemplatesByIds(templateIds),
    ctx.getCompanyIdsForUser(userId),
  ]);
  const allowed = new Set(companyIds);
  return templates.filter((t) => allowed.has(t.companyId));
}

export async function resolveHmVisibilityForKit(
  ctx: Pick<ScorecardsCtx<unknown>, "resolveJobHmVisibility">,
  kit: InterviewKitRow | null,
): Promise<ScorecardHmVisibility> {
  if (!kit || !ctx.resolveJobHmVisibility) return "always_show_hm";
  return ctx.resolveJobHmVisibility(kit.companyId, kit.jobId ?? null);
}
