/** Stage question bank + kit competency-coverage use cases (#1390). */

import type {
  ICompetenciesRepository,
  IInterviewKitsRepository,
  IScorecardTemplatesRepository,
  IStageQuestionsRepository,
} from "../../repositories/scorecardsRepository.js";
import type { ScorecardsCtx } from "./context.js";
import { ServiceError } from "./errors.js";
import { loadKit } from "./access.js";

export type StageQuestionsCtx = ScorecardsCtx<
  IInterviewKitsRepository & IStageQuestionsRepository
>;
export type KitCoverageCtx = ScorecardsCtx<
  IInterviewKitsRepository &
    IStageQuestionsRepository &
    IScorecardTemplatesRepository &
    ICompetenciesRepository
>;

export async function listStageQuestions(ctx: StageQuestionsCtx, userId: string, kitStageId: string) {
  const stage = await ctx.repo.findStageById(kitStageId);
  if (!stage) throw new ServiceError("NOT_FOUND", "Stage not found");
  await loadKit(ctx, userId, stage.kitId);
  return ctx.repo.findQuestionsForStage(kitStageId);
}

export async function addStageQuestion(
  ctx: StageQuestionsCtx,
  userId: string,
  kitStageId: string,
  input: {
    prompt: string;
    competencyId?: string | null;
    difficulty?: string | null;
    expectedAnswer?: string;
  },
) {
  const stage = await ctx.repo.findStageById(kitStageId);
  if (!stage) throw new ServiceError("NOT_FOUND", "Stage not found");
  await loadKit(ctx, userId, stage.kitId);
  return ctx.repo.insertStageQuestion({
    kitStageId,
    prompt: input.prompt,
    competencyId: input.competencyId ?? null,
    difficulty: input.difficulty ?? null,
    expectedAnswer: input.expectedAnswer ?? "open",
  });
}

export async function deleteStageQuestion(ctx: StageQuestionsCtx, userId: string, id: string) {
  const q = await ctx.repo.findStageQuestionById(id);
  if (!q) throw new ServiceError("NOT_FOUND", "Question not found");
  const stage = await ctx.repo.findStageById(q.kitStageId);
  if (!stage) throw new ServiceError("NOT_FOUND", "Stage not found");
  await loadKit(ctx, userId, stage.kitId);
  await ctx.repo.deleteStageQuestion(id);
}

/**
 * Coverage warning for a kit — surface attributes (or competencies)
 * the rubric assesses that have NO questions tagged against them.
 * Used by the kit editor to nudge recruiters into closing gaps before
 * sending the loop.
 */
export async function getKitCoverage(
  ctx: KitCoverageCtx,
  userId: string,
  kitId: string,
): Promise<{
  competencyId: string;
  competencyName: string;
  hasQuestions: boolean;
}[]> {
  const kit = await loadKit(ctx, userId, kitId);
  const stages = await ctx.repo.findStagesForKit(kit.id);
  const templateIds = Array.from(
    new Set(
      stages
        .map((s) => s.scorecardTemplateId)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  if (templateIds.length === 0) return [];
  const attrs = await ctx.repo.findAttributesForTemplates(templateIds);
  const competencyIds = Array.from(
    new Set(
      attrs.map((a) => a.competencyId).filter((id): id is string => Boolean(id)),
    ),
  );
  if (competencyIds.length === 0) return [];
  const [allQuestions, competencyList] = await Promise.all([
    ctx.repo.findQuestionsForStages(stages.map((s) => s.id)),
    ctx.repo.findCompetenciesByIds(competencyIds),
  ]);
  const competenciesWithQuestions = new Set(
    allQuestions.map((q) => q.competencyId).filter(Boolean) as string[],
  );
  // Preserve the attribute-derived competency order.
  const competencyById = new Map(competencyList.map((c) => [c.id, c]));
  return competencyIds
    .map((id) => competencyById.get(id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((c) => ({
      competencyId: c.id,
      competencyName: c.name,
      hasQuestions: competenciesWithQuestions.has(c.id),
    }));
}
