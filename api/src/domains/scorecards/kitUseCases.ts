/** Interview kit + kit-stage use cases. */

import type {
  IInterviewKitsRepository,
  InterviewKitRow,
  InterviewKitStageRow,
  UpdateStagePatch,
} from "../../repositories/scorecardsRepository.js";
import type { CreateKitInput, StageInput, UpdateKitInput } from "./schemas.js";
import type { ScorecardsCtx } from "./context.js";
import type { KitWithStages } from "./results.js";
import { ServiceError } from "./errors.js";
import { assertCompanyAccess, loadKit } from "./access.js";

export type KitsCtx = ScorecardsCtx<IInterviewKitsRepository>;

export async function listKits(
  ctx: KitsCtx,
  userId: string,
  filter: { onlyCompanyId?: string; jobId?: string },
): Promise<InterviewKitRow[]> {
  const companyIds = await ctx.getCompanyIdsForUser(userId);
  if (companyIds.length === 0) return [];
  if (filter.onlyCompanyId && !companyIds.includes(filter.onlyCompanyId)) return [];
  return ctx.repo.findActiveKits({
    companyIds,
    jobId: filter.jobId,
    onlyCompanyId: filter.onlyCompanyId,
  });
}

export async function getKit(ctx: KitsCtx, userId: string, id: string): Promise<KitWithStages> {
  const kit = await loadKit(ctx, userId, id);
  const stages = await ctx.repo.findStagesForKit(kit.id);
  return { ...kit, stages };
}

export async function createKit(ctx: KitsCtx, userId: string, input: CreateKitInput): Promise<KitWithStages> {
  await assertCompanyAccess(ctx, userId, input.companyId);
  const kit = await ctx.repo.insertKit({
    companyId: input.companyId,
    jobId: input.jobId,
    createdByUserId: userId,
    name: input.name,
    description: input.description,
    blindReviewMode: input.blindReviewMode ?? "off",
    escalateToUserId: input.escalateToUserId ?? null,
  });
  const stages = await ctx.repo.insertStages(
    input.stages.map((s, i) => ({
      kitId: kit.id,
      name: s.name,
      description: s.description,
      displayOrder: s.displayOrder ?? i,
      durationMinutes: s.durationMinutes ?? 60,
      suggestedQuestions: s.suggestedQuestions,
      scorecardTemplateId: s.scorecardTemplateId,
      stageKind: s.stageKind ?? "interview",
    })),
  );
  return { ...kit, stages };
}

export async function updateKit(
  ctx: KitsCtx,
  userId: string,
  id: string,
  patch: UpdateKitInput,
): Promise<InterviewKitRow> {
  await loadKit(ctx, userId, id);
  return ctx.repo.updateKit(id, patch);
}

export async function addStage(
  ctx: KitsCtx,
  userId: string,
  kitId: string,
  input: StageInput,
): Promise<InterviewKitStageRow> {
  await loadKit(ctx, userId, kitId);
  return ctx.repo.insertStage({
    kitId,
    name: input.name,
    description: input.description,
    displayOrder: input.displayOrder ?? 0,
    durationMinutes: input.durationMinutes ?? 60,
    suggestedQuestions: input.suggestedQuestions,
    scorecardTemplateId: input.scorecardTemplateId,
    stageKind: input.stageKind ?? "interview",
  });
}

export async function updateStage(
  ctx: KitsCtx,
  userId: string,
  id: string,
  patch: Partial<StageInput>,
): Promise<InterviewKitStageRow> {
  const stage = await ctx.repo.findStageById(id);
  if (!stage) throw new ServiceError("NOT_FOUND", "Stage not found");
  await loadKit(ctx, userId, stage.kitId);
  const repoPatch: UpdateStagePatch = {
    name: patch.name,
    description: patch.description,
    displayOrder: patch.displayOrder,
    durationMinutes: patch.durationMinutes,
    suggestedQuestions: patch.suggestedQuestions,
    scorecardTemplateId: patch.scorecardTemplateId,
    stageKind: patch.stageKind,
  };
  return ctx.repo.updateStage(id, repoPatch);
}

export async function deleteStage(ctx: KitsCtx, userId: string, id: string): Promise<void> {
  const stage = await ctx.repo.findStageById(id);
  if (!stage) throw new ServiceError("NOT_FOUND", "Stage not found");
  await loadKit(ctx, userId, stage.kitId);
  await ctx.repo.deleteStage(id);
}
