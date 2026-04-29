/**
 * Studio Templates Service — typed client for the creator-template marketplace.
 *
 * Backed by `/api/studio/templates*`. Mirrors the lightweight wrapper pattern
 * used by the other domain services in this folder (one zod schema per
 * payload + a small surface of methods, no in-component fetch calls).
 */

import { z } from "zod";
import { apiClient } from "../api-client";

// ─── Schemas ────────────────────────────────────────────────────────────────

export const StudioTemplateSchema = z.object({
  id: z.string(),
  creatorId: z.string(),
  sourceProjectId: z.string().nullable().optional(),
  name: z.string(),
  description: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  previewVideoUrl: z.string().nullable().optional(),
  videoScript: z.unknown(),
  durationSec: z.number().int().nullable().optional(),
  motion: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]).optional(),
  visibility: z.enum(["private", "unlisted", "public"]),
  listingSlug: z.string().nullable().optional(),
  priceCents: z.number().int(),
  currency: z.string(),
  platformFeeBps: z.number().int(),
  consentAgreedAt: z.string().nullable().optional(),
  viewCount: z.number().int().default(0),
  purchaseCount: z.number().int().default(0),
  publishedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type StudioTemplate = z.infer<typeof StudioTemplateSchema>;

export const TemplateLicenseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  templateKind: z.enum(["resume", "job", "studio"]),
  templateId: z.string(),
  source: z.enum(["owner", "free", "purchase"]),
  pricePaidCents: z.number().int().default(0),
  creatorCutCents: z.number().int().default(0),
  platformCutCents: z.number().int().default(0),
  paymentRef: z.string().nullable().optional(),
  grantedAt: z.string(),
});

export type TemplateLicense = z.infer<typeof TemplateLicenseSchema>;

// ─── Inputs ─────────────────────────────────────────────────────────────────

export interface PublishTemplateInput {
  sourceProjectId: string;
  name: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  previewVideoUrl?: string | null;
  language?: string | null;
  tags?: string[];
  priceCents: number;
  currency?: "USD";
  visibility?: "private" | "unlisted" | "public";
  /** Required when visibility === 'public' for the first time. */
  consentAccepted?: boolean;
}

export interface UpdateTemplateInput {
  name?: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  previewVideoUrl?: string | null;
  language?: string | null;
  tags?: string[];
  priceCents?: number;
  currency?: "USD";
  visibility?: "private" | "unlisted" | "public";
  consentAccepted?: boolean;
}

// ─── Service ────────────────────────────────────────────────────────────────

export const studioTemplatesService = {
  async publish(input: PublishTemplateInput): Promise<StudioTemplate> {
    const res = await apiClient.post<StudioTemplate>("/api/studio/templates", input);
    return StudioTemplateSchema.parse(res.data);
  },

  async update(templateId: string, patch: UpdateTemplateInput): Promise<StudioTemplate> {
    const res = await apiClient.patch<StudioTemplate>(
      `/api/studio/templates/${templateId}`,
      patch,
    );
    return StudioTemplateSchema.parse(res.data);
  },

  async deleteById(templateId: string): Promise<void> {
    await apiClient.delete(`/api/studio/templates/${templateId}`);
  },

  async listMine(): Promise<StudioTemplate[]> {
    const res = await apiClient.get<StudioTemplate[]>("/api/studio/templates/me");
    return z.array(StudioTemplateSchema).parse(res.data ?? []);
  },

  async getById(id: string): Promise<StudioTemplate> {
    const res = await apiClient.get<StudioTemplate>(`/api/studio/templates/${id}`);
    return StudioTemplateSchema.parse(res.data);
  },

  async getBySlug(slug: string): Promise<StudioTemplate> {
    const res = await apiClient.get<StudioTemplate>(`/api/studio/templates/listing/${slug}`);
    return StudioTemplateSchema.parse(res.data);
  },

  async claimFree(templateId: string): Promise<TemplateLicense> {
    const res = await apiClient.post<TemplateLicense>(
      `/api/studio/templates/${templateId}/claim`,
      {},
    );
    return TemplateLicenseSchema.parse(res.data);
  },

  async listLicenses(): Promise<TemplateLicense[]> {
    const res = await apiClient.get<TemplateLicense[]>(
      "/api/studio/templates/licenses/me",
    );
    return z.array(TemplateLicenseSchema).parse(res.data ?? []);
  },
};
