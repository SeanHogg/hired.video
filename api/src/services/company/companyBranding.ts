/**
 * Employer branding page use cases — public read of the published page and
 * the owner upsert behind PATCH /api/companies/:id/branding.
 */
import { z } from "zod";
import { DomainError } from "../../domains/errors.js";
import { findCompany } from "./companyDirectory.js";
import {
  brandingPageExists,
  findBrandingPage,
  insertBrandingPage,
  updateBrandingPage,
  type EmployerBrandingPageRow,
} from "../../repositories/companyDirectoryRepository.js";

export const BrandingPageSchema = z.object({
  heroVideoUrl: z.string().url().optional().nullable(),
  heroHeadline: z.string().max(200).optional().nullable(),
  heroSubtitle: z.string().max(500).optional().nullable(),
  cultureStatement: z.string().max(2000).optional().nullable(),
  values: z.array(z.object({ title: z.string(), description: z.string(), emoji: z.string().optional() })).default([]),
  perks: z.array(z.object({ title: z.string(), description: z.string(), icon: z.string().optional() })).default([]),
  mediaGallery: z.array(z.object({ url: z.string(), type: z.enum(["image", "video"]), caption: z.string().optional() })).default([]),
  teamHighlights: z.array(z.object({ name: z.string(), role: z.string(), quote: z.string(), avatarUrl: z.string().optional() })).default([]),
  awardsAndRecognition: z.array(z.object({ title: z.string(), year: z.number().optional(), imageUrl: z.string().optional() })).default([]),
  primaryColor: z.string().max(20).optional(),
  isPublished: z.boolean().optional(),
});

/** The published branding page for a company (uuid or slug); 404 when the
 *  company or a published page is missing. */
export async function getPublishedBrandingPage(idOrSlug: string): Promise<EmployerBrandingPageRow> {
  const company = await findCompany(idOrSlug);
  if (!company) throw new DomainError(404, "NOT_FOUND", "Branding page not found");
  const page = await findBrandingPage(company.id);
  if (!page || !page.isPublished) throw new DomainError(404, "NOT_FOUND", "Branding page not found");
  return page;
}

/** Validate + upsert the branding page. `created` tells the route whether
 *  to answer 201 (insert) or 200 (update). */
export async function upsertBrandingPage(
  companyId: string,
  body: unknown,
): Promise<{ page: EmployerBrandingPageRow; created: boolean }> {
  const parsed = BrandingPageSchema.safeParse(body);
  if (!parsed.success) throw new DomainError(400, "VALIDATION_ERROR", "Invalid branding data");

  const data = parsed.data;
  const now = new Date();
  if (await brandingPageExists(companyId)) {
    const page = await updateBrandingPage(companyId, {
      ...data,
      publishedAt: data.isPublished ? now : undefined,
      updatedAt: now,
    });
    return { page, created: false };
  }

  const page = await insertBrandingPage({
    companyId,
    ...data,
    publishedAt: data.isPublished ? now : null,
  });
  return { page, created: true };
}
