/**
 * Review subject lookup for a template — résumé or video alike.
 *
 * Both review subject types (`resume_template`, `video_template`) name a
 * studio template: a résumé template is a studio template with
 * document_kind = 'resume' (mig 0520 moved the legacy `resume_templates`
 * rows there, ids preserved). The two types differ only in their review
 * FORM (sub-ratings), so they share this one lookup: the owner is the
 * template's creator, and a reviewer is a buyer when they hold a 'studio'
 * license on it.
 */

import { isUuid } from "../../../../shared/value-types.js";
import type { IStudioTemplatesRepository } from "../../repositories/index.js";

export interface TemplateReviewSubject {
  ownerId: string;
  buyerId?: string;
  verifyAgainst: Record<string, never>;
}

export async function resolveTemplateReviewSubject(
  repo: Pick<IStudioTemplatesRepository, "findById" | "findLicense">,
  templateId: string,
  reviewerId?: string,
): Promise<TemplateReviewSubject | null> {
  // Built-in presets (descriptor slugs) are not reviewable rows.
  if (!isUuid(templateId)) return null;
  const template = await repo.findById(templateId);
  if (!template) return null;
  const license = reviewerId ? await repo.findLicense(reviewerId, "studio", template.id) : null;
  return {
    ownerId: template.creatorId,
    ...(license ? { buyerId: license.userId } : {}),
    verifyAgainst: {},
  };
}
