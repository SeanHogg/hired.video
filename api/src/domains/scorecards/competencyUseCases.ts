/** Competency library use cases (#1382). */

import type {
  CompetencyLevelRow,
  ICompetenciesRepository,
} from "../../repositories/scorecardsRepository.js";
import type { CreateCompetencyInput, UpdateCompetencyInput } from "./schemas.js";
import type { ScorecardsCtx } from "./context.js";
import type { CompetencyWithLevels } from "./results.js";
import { ServiceError } from "./errors.js";
import { assertCompanyAccess } from "./access.js";

export type CompetenciesCtx = ScorecardsCtx<ICompetenciesRepository>;

export async function listCompetencies(
  ctx: CompetenciesCtx,
  userId: string,
  onlyCompanyId?: string,
): Promise<CompetencyWithLevels[]> {
  const companyIds = await ctx.getCompanyIdsForUser(userId);
  if (companyIds.length === 0) return [];
  if (onlyCompanyId && !companyIds.includes(onlyCompanyId)) return [];
  const target = onlyCompanyId ? [onlyCompanyId] : companyIds;
  const comps = await ctx.repo.findActiveCompetenciesForCompanies(target);
  if (comps.length === 0) return [];
  const levels = await ctx.repo.findLevelsForCompetencies(
    comps.map((c) => c.id),
  );
  const byCompetency = new Map<string, CompetencyLevelRow[]>();
  for (const lv of levels) {
    const bucket = byCompetency.get(lv.competencyId) ?? [];
    bucket.push(lv);
    byCompetency.set(lv.competencyId, bucket);
  }
  return comps.map((c) => ({ ...c, levels: byCompetency.get(c.id) ?? [] }));
}

export async function getCompetency(ctx: CompetenciesCtx, userId: string, id: string): Promise<CompetencyWithLevels> {
  const comp = await ctx.repo.findCompetencyById(id);
  if (!comp) throw new ServiceError("NOT_FOUND", "Competency not found");
  await assertCompanyAccess(ctx, userId, comp.companyId);
  const levels = await ctx.repo.findLevelsForCompetencies([comp.id]);
  return { ...comp, levels };
}

export async function createCompetency(
  ctx: CompetenciesCtx,
  userId: string,
  input: CreateCompetencyInput,
): Promise<CompetencyWithLevels> {
  await assertCompanyAccess(ctx, userId, input.companyId);
  const comp = await ctx.repo.insertCompetency({
    companyId: input.companyId,
    createdByUserId: userId,
    name: input.name,
    description: input.description,
    taxonomy: input.taxonomy,
  });
  const levels =
    input.levels && input.levels.length > 0
      ? await ctx.repo.insertCompetencyLevels(
          input.levels.map((lv) => ({
            competencyId: comp.id,
            level: lv.level,
            label: lv.label,
            anchor: lv.anchor,
          })),
        )
      : [];
  return { ...comp, levels };
}

export async function updateCompetency(
  ctx: CompetenciesCtx,
  userId: string,
  id: string,
  patch: UpdateCompetencyInput & { levels?: CreateCompetencyInput["levels"] },
): Promise<CompetencyWithLevels> {
  const existing = await ctx.repo.findCompetencyById(id);
  if (!existing) throw new ServiceError("NOT_FOUND", "Competency not found");
  await assertCompanyAccess(ctx, userId, existing.companyId);
  const { levels, ...metaPatch } = patch;
  const updated = await ctx.repo.updateCompetency(id, metaPatch);
  // Replace-all semantics on levels when provided — keeps the editor
  // simple (the UI sends the full leveled rubric every save).
  if (levels) {
    await ctx.repo.deleteLevelsForCompetency(id);
    const inserted =
      levels.length > 0
        ? await ctx.repo.insertCompetencyLevels(
            levels.map((lv) => ({
              competencyId: id,
              level: lv.level,
              label: lv.label,
              anchor: lv.anchor,
            })),
          )
        : [];
    return { ...updated, levels: inserted };
  }
  const existingLevels = await ctx.repo.findLevelsForCompetencies([id]);
  return { ...updated, levels: existingLevels };
}
