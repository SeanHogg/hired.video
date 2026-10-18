/** Scorecard template + rubric-attribute use cases. */

import type {
  IScorecardTemplatesRepository,
  ScorecardAttributeRow,
  ScorecardTemplateRow,
  UpdateAttributePatch,
} from "../../repositories/scorecardsRepository.js";
import type { AttributeInput, CreateTemplateInput, UpdateTemplateInput } from "./schemas.js";
import type { ScorecardsCtx } from "./context.js";
import type { TemplateWithAttributes } from "./results.js";
import { ServiceError } from "./errors.js";
import { assertCompanyAccess, loadTemplate } from "./access.js";

export type TemplatesCtx = ScorecardsCtx<IScorecardTemplatesRepository>;

export async function listTemplates(
  ctx: TemplatesCtx,
  userId: string,
  onlyCompanyId?: string,
): Promise<ScorecardTemplateRow[]> {
  const companyIds = await ctx.getCompanyIdsForUser(userId);
  if (companyIds.length === 0) return [];
  if (onlyCompanyId && !companyIds.includes(onlyCompanyId)) return [];
  const target = onlyCompanyId ? [onlyCompanyId] : companyIds;
  return ctx.repo.findActiveTemplatesForCompanies(target);
}

export async function getTemplate(ctx: TemplatesCtx, userId: string, id: string): Promise<TemplateWithAttributes> {
  const tpl = await loadTemplate(ctx, userId, id);
  const attributes = await ctx.repo.findAttributesForTemplate(tpl.id);
  return { ...tpl, attributes };
}

export async function createTemplate(
  ctx: TemplatesCtx,
  userId: string,
  input: CreateTemplateInput,
): Promise<TemplateWithAttributes> {
  await assertCompanyAccess(ctx, userId, input.companyId);
  const tpl = await ctx.repo.insertTemplate({
    companyId: input.companyId,
    createdByUserId: userId,
    name: input.name,
    description: input.description,
    ratingScale: input.ratingScale,
    roleFamily: input.roleFamily,
    requiredCertificationCourseId: input.requiredCertificationCourseId ?? null,
  });
  const attributes = await ctx.repo.insertAttributes(
    input.attributes.map((a, i) => ({
      templateId: tpl.id,
      name: a.name,
      description: a.description,
      displayOrder: a.displayOrder ?? i,
      weight: a.weight ?? 1,
      anchors: a.anchors as Record<string, string> | undefined,
      competencyId: a.competencyId ?? null,
    })),
  );
  return { ...tpl, attributes };
}

export async function updateTemplate(
  ctx: TemplatesCtx,
  userId: string,
  id: string,
  patch: UpdateTemplateInput,
): Promise<ScorecardTemplateRow> {
  await loadTemplate(ctx, userId, id);
  return ctx.repo.updateTemplate(id, patch);
}

export async function addAttribute(
  ctx: TemplatesCtx,
  userId: string,
  templateId: string,
  input: AttributeInput,
): Promise<ScorecardAttributeRow> {
  await loadTemplate(ctx, userId, templateId);
  return ctx.repo.insertAttribute({
    templateId,
    name: input.name,
    description: input.description,
    displayOrder: input.displayOrder ?? 0,
    weight: input.weight ?? 1,
    anchors: input.anchors as Record<string, string> | undefined,
    competencyId: input.competencyId ?? null,
  });
}

export async function updateAttribute(
  ctx: TemplatesCtx,
  userId: string,
  id: string,
  patch: Partial<AttributeInput>,
): Promise<ScorecardAttributeRow> {
  const attr = await ctx.repo.findAttributeById(id);
  if (!attr) throw new ServiceError("NOT_FOUND", "Attribute not found");
  await loadTemplate(ctx, userId, attr.templateId);
  const repoPatch: UpdateAttributePatch = {
    name: patch.name,
    description: patch.description,
    displayOrder: patch.displayOrder,
    weight: patch.weight,
    anchors: patch.anchors,
    competencyId: patch.competencyId,
  };
  return ctx.repo.updateAttribute(id, repoPatch);
}

export async function deleteAttribute(ctx: TemplatesCtx, userId: string, id: string): Promise<void> {
  const attr = await ctx.repo.findAttributeById(id);
  if (!attr) throw new ServiceError("NOT_FOUND", "Attribute not found");
  await loadTemplate(ctx, userId, attr.templateId);
  await ctx.repo.deleteAttribute(id);
}
