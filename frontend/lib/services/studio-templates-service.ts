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
  /** Set when the template is owned by a company (royalties accrue to
   *  the company instead of the individual creator). When equal to the
   *  Hired.VIDEO Community company id, treat as platform-shipped — the
   *  search payload also exposes a `firstParty` boolean for that case. */
  companyId: z.string().nullable().optional(),
  /** True iff the template is owned by the Hired.VIDEO Community company.
   *  Set by the search route via the cached company-id resolver — the
   *  single source of truth lives at services/job/JobService.ts
   *  getHiredVideoCommunityCompanyId(). */
  firstParty: z.boolean().optional(),
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

/** Studio template + the license row that granted it to the caller.
 *  Returned by `GET /templates/me/licensed`; used by the /studio "Your
 *  templates" surface to render cards alongside the user's own published
 *  templates without forcing a second round-trip per row. */
export const LicensedStudioTemplateSchema = z.object({
  template: StudioTemplateSchema,
  license: TemplateLicenseSchema,
});

export type LicensedStudioTemplate = z.infer<typeof LicensedStudioTemplateSchema>;

// ─── Creator earnings rollup ────────────────────────────────────────────────

export const CreatorTemplateEarningsRowSchema = z.object({
  templateId: z.string(),
  name: z.string(),
  listingSlug: z.string().nullable().optional(),
  visibility: z.enum(["private", "unlisted", "public"]),
  priceCents: z.number().int(),
  currency: z.string(),
  thumbnailUrl: z.string().nullable().optional(),
  purchaseCount: z.number().int(),
  earningsCents: z.number().int(),
  paidLicenseCount: z.number().int(),
});

export type CreatorTemplateEarningsRow = z.infer<typeof CreatorTemplateEarningsRowSchema>;

export const CreatorTemplateEarningsSchema = z.object({
  rows: z.array(CreatorTemplateEarningsRowSchema),
  totalEarningsCents: z.number().int(),
  totalPaidLicenses: z.number().int(),
  currency: z.string(),
});

export type CreatorTemplateEarnings = z.infer<typeof CreatorTemplateEarningsSchema>;

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
  /** Optional inline VideoScript passed at click time. V2 callers
   *  compute this via `canvasStateToScript(state)` so the V2 project
   *  row doesn't have to mirror a v1 storyboard column on every save
   *  (gap #637). When omitted, the server reads from `project.storyboard`
   *  — the legacy V1 path. */
  videoScript?: unknown;
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

  /** Public marketplace listing — every `visibility='public'` template across
   *  all creators. Anonymous-friendly. Used by the unified template registry
   *  to populate `/search?category=templates` with creator-published work
   *  alongside the static catalogs. */
  async listPublic(opts: { search?: string; limit?: number } = {}): Promise<StudioTemplate[]> {
    const params = new URLSearchParams();
    if (opts.search) params.set("search", opts.search);
    if (opts.limit != null) params.set("limit", String(opts.limit));
    const qs = params.toString() ? `?${params.toString()}` : "";
    const res = await apiClient.get<StudioTemplate[]>(`/api/studio/templates/public${qs}`);
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

  /** Studio templates the caller has claimed (free) or purchased (paid),
   *  joined with the template row so a single round-trip renders cards.
   *  Owner-licenses are excluded server-side — those duplicate `listMine`
   *  and the /studio surface renders Created vs Purchased separately. */
  async listMyLicensedTemplates(): Promise<LicensedStudioTemplate[]> {
    const res = await apiClient.get<LicensedStudioTemplate[]>(
      "/api/studio/templates/me/licensed",
    );
    return z.array(LicensedStudioTemplateSchema).parse(res.data ?? []);
  },

  /** Per-template + aggregate earnings rollup for the creator dashboard.
   *  Backed by GET /api/studio/templates/me/earnings — includes zero-sale
   *  templates so the UI can show "$0 so far" instead of hiding the row. */
  async myEarnings(): Promise<CreatorTemplateEarnings> {
    const res = await apiClient.get<CreatorTemplateEarnings>(
      "/api/studio/templates/me/earnings",
    );
    return CreatorTemplateEarningsSchema.parse(res.data);
  },
};
