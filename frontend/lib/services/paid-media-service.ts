/**
 * Paid Media service — wraps /api/paid-media/*.
 *
 * Used by both the customer-facing /settings/ads UI and the
 * /superadmin/ads internal-growth UI. Workspace selection is encoded
 * in the URL as ?workspace=personal | company:<uuid> | delegated:<uuid>.
 *
 * Pixel injection lives in lib/paid-media-pixels.ts (loaded by App.tsx
 * shell) — this service only handles CRUD + sync, not runtime tracking.
 */

import { z } from "zod";
import { apiClient } from "../api-client";

export const PAID_MEDIA_PLATFORMS = ["meta", "google", "linkedin", "tiktok", "bing"] as const;
export type PaidMediaPlatform = (typeof PAID_MEDIA_PLATFORMS)[number];

// ─── Schemas ──────────────────────────────────────────────────────────────
export const PlatformInfoSchema = z.object({
  platform: z.enum(PAID_MEDIA_PLATFORMS),
  configured: z.boolean(),
  capabilities: z.object({
    targeting: z.array(z.string()),
    objectives: z.array(z.string()),
    supportsConversions: z.boolean(),
    supportsReporting: z.boolean(),
    supportsAudienceSync: z.boolean(),
    docsUrl: z.string(),
  }),
});

export const ConnectionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  companyId: z.string().nullable(),
  platform: z.enum(PAID_MEDIA_PLATFORMS),
  externalUserId: z.string().nullable(),
  externalUserHandle: z.string().nullable(),
  scopes: z.string(),
  status: z.string(),
  lastSyncedAt: z.string().nullable(),
  lastError: z.string().nullable(),
  accessTokenExpiresAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Connection = z.infer<typeof ConnectionSchema>;

export const AccountSchema = z.object({
  id: z.string(),
  connectionId: z.string(),
  userId: z.string(),
  companyId: z.string().nullable(),
  platform: z.enum(PAID_MEDIA_PLATFORMS),
  externalAccountId: z.string(),
  name: z.string(),
  currencyCode: z.string().nullable(),
  timeZone: z.string().nullable(),
  isPrimary: z.boolean(),
  status: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Account = z.infer<typeof AccountSchema>;

export const CampaignSchema = z.object({
  id: z.string(),
  userId: z.string(),
  companyId: z.string().nullable(),
  name: z.string(),
  objective: z.string(),
  status: z.string(),
  budgetCents: z.number().nullable(),
  dailyBudgetCents: z.number().nullable(),
  spentCents: z.number(),
  currencyCode: z.string(),
  startAt: z.string().nullable(),
  endAt: z.string().nullable(),
  subjectType: z.string().nullable(),
  subjectId: z.string().nullable(),
  notes: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Campaign = z.infer<typeof CampaignSchema>;

export const AdSetSchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  userId: z.string(),
  companyId: z.string().nullable(),
  name: z.string(),
  status: z.string(),
  bidStrategy: z.string(),
  bidAmountCents: z.number().nullable(),
  optimizationGoal: z.string(),
  dailyBudgetCents: z.number().nullable(),
  lifetimeBudgetCents: z.number().nullable(),
  targeting: z.record(z.string(), z.unknown()),
  frequencyCapImpressions: z.number().nullable(),
  frequencyCapHours: z.number().nullable(),
  startAt: z.string().nullable(),
  endAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdSet = z.infer<typeof AdSetSchema>;

export const AdSchema = z.object({
  id: z.string(),
  adSetId: z.string(),
  userId: z.string(),
  companyId: z.string().nullable(),
  name: z.string(),
  status: z.string(),
  creativeId: z.string().nullable(),
  destinationUrl: z.string(),
  utmSource: z.string().nullable(),
  utmMedium: z.string().nullable(),
  utmCampaign: z.string().nullable(),
  utmContent: z.string().nullable(),
  utmTerm: z.string().nullable(),
  variantGroup: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Ad = z.infer<typeof AdSchema>;

export const CreativeSchema = z.object({
  id: z.string(),
  userId: z.string(),
  companyId: z.string().nullable(),
  name: z.string(),
  format: z.string(),
  headline: z.string().nullable(),
  primaryText: z.string().nullable(),
  description: z.string().nullable(),
  ctaText: z.string(),
  assetUrl: z.string().nullable(),
  assetThumbnailUrl: z.string().nullable(),
  studioProjectId: z.string().nullable(),
  assets: z.array(z.record(z.string(), z.unknown())),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Creative = z.infer<typeof CreativeSchema>;

export const InsightSchema = z.object({
  id: z.string(),
  platform: z.enum(PAID_MEDIA_PLATFORMS),
  accountId: z.string(),
  resourceKind: z.string(),
  internalId: z.string().nullable(),
  externalId: z.string(),
  date: z.string(),
  impressions: z.number(),
  clicks: z.number(),
  spendCents: z.number(),
  conversions: z.number(),
  videoViews: z.number(),
  rawMetrics: z.record(z.string(), z.unknown()),
  fetchedAt: z.string(),
});
export type Insight = z.infer<typeof InsightSchema>;

export const PixelConfigSchema = z.object({
  configured: z.boolean(),
  metaPixelId: z.string().nullable().optional(),
  googleAdsConversionId: z.string().nullable().optional(),
  googleAdsConversionLabel: z.string().nullable().optional(),
  ga4MeasurementId: z.string().nullable().optional(),
  linkedInPartnerId: z.string().nullable().optional(),
  tiktokPixelId: z.string().nullable().optional(),
  bingUetTagId: z.string().nullable().optional(),
  metaCapiTokenSet: z.boolean().optional(),
  tiktokAccessTokenSet: z.boolean().optional(),
  linkedInCapiTokenSet: z.boolean().optional(),
  bingUetApiTokenSet: z.boolean().optional(),
  ga4ApiSecretSet: z.boolean().optional(),
});
export type PixelConfig = z.infer<typeof PixelConfigSchema>;

export const PublicPixelConfigSchema = z.object({
  configured: z.boolean().optional(),
  metaPixelId: z.string().nullable().optional(),
  googleAdsConversionId: z.string().nullable().optional(),
  googleAdsConversionLabel: z.string().nullable().optional(),
  ga4MeasurementId: z.string().nullable().optional(),
  linkedInPartnerId: z.string().nullable().optional(),
  tiktokPixelId: z.string().nullable().optional(),
  bingUetTagId: z.string().nullable().optional(),
});
export type PublicPixelConfig = z.infer<typeof PublicPixelConfigSchema>;

// ─── Workspace param ──────────────────────────────────────────────────────
export type WorkspaceParam =
  | { kind: "personal" }
  | { kind: "company"; companyId: string }
  | { kind: "delegated"; subjectUserId: string };

export function serializeWorkspace(w: WorkspaceParam | null | undefined): string {
  if (!w || w.kind === "personal") return "personal";
  if (w.kind === "company") return `company:${w.companyId}`;
  if (w.kind === "delegated") return `delegated:${w.subjectUserId}`;
  return "personal";
}

function wsQuery(w: WorkspaceParam | null | undefined): string {
  return `?workspace=${encodeURIComponent(serializeWorkspace(w))}`;
}

// ─── Service ──────────────────────────────────────────────────────────────
class PaidMediaService {
  async listPlatforms() {
    const res = await apiClient.get<{ data: Array<z.infer<typeof PlatformInfoSchema>> }>(
      "/api/paid-media/platforms",
      z.object({ data: z.array(PlatformInfoSchema) }),
    );
    return res.data.data;
  }

  async listConnections() {
    const res = await apiClient.get<{ data: Connection[] }>(
      "/api/paid-media/connections",
      z.object({ data: z.array(ConnectionSchema) }),
    );
    return res.data.data;
  }

  async deleteConnection(id: string) {
    await apiClient.delete(`/api/paid-media/connections/${id}`);
  }

  async listAccounts() {
    const res = await apiClient.get<{ data: Account[] }>(
      "/api/paid-media/accounts",
      z.object({ data: z.array(AccountSchema) }),
    );
    return res.data.data;
  }

  /** Start the OAuth flow. Returns the URL the browser should
   *  navigate to (consent screen). Caller does `window.location.href = url`. */
  async startOAuth(platform: PaidMediaPlatform, workspace: WorkspaceParam | null = null, redirectTo?: string) {
    const res = await apiClient.post<{ data: { url: string } }>(
      "/api/paid-media/oauth/start",
      { platform, workspace: serializeWorkspace(workspace), redirectTo },
      z.object({ data: z.object({ url: z.string() }) }),
    );
    return res.data.data.url;
  }

  async listCampaigns(workspace?: WorkspaceParam | null) {
    const res = await apiClient.get<{ data: Campaign[] }>(
      `/api/paid-media/campaigns${wsQuery(workspace)}`,
      z.object({ data: z.array(CampaignSchema) }),
    );
    return res.data.data;
  }

  async getCampaign(id: string) {
    const res = await apiClient.get<{ data: Campaign }>(
      `/api/paid-media/campaigns/${id}`,
      z.object({ data: CampaignSchema }),
    );
    return res.data.data;
  }

  async createCampaign(input: Partial<Campaign>, workspace?: WorkspaceParam | null) {
    const res = await apiClient.post<{ data: Campaign }>(
      `/api/paid-media/campaigns${wsQuery(workspace)}`,
      input,
      z.object({ data: CampaignSchema }),
    );
    return res.data.data;
  }

  async updateCampaign(id: string, patch: Partial<Campaign>) {
    const res = await apiClient.patch<{ data: Campaign }>(
      `/api/paid-media/campaigns/${id}`,
      patch,
      z.object({ data: CampaignSchema }),
    );
    return res.data.data;
  }

  async deleteCampaign(id: string) {
    await apiClient.delete(`/api/paid-media/campaigns/${id}`);
  }

  async syncCampaign(campaignId: string, accountId: string) {
    const res = await apiClient.post<{ data: { platform: string; success: boolean; externalId?: string; error?: string } }>(
      `/api/paid-media/campaigns/${campaignId}/sync`,
      { accountId },
      z.object({ data: z.object({ platform: z.string(), success: z.boolean(), externalId: z.string().optional(), error: z.string().optional() }) }),
    );
    return res.data.data;
  }

  async listAdSets(campaignId: string) {
    const res = await apiClient.get<{ data: AdSet[] }>(
      `/api/paid-media/campaigns/${campaignId}/ad-sets`,
      z.object({ data: z.array(AdSetSchema) }),
    );
    return res.data.data;
  }

  async createAdSet(campaignId: string, input: Partial<AdSet>) {
    const res = await apiClient.post<{ data: AdSet }>(
      `/api/paid-media/campaigns/${campaignId}/ad-sets`,
      input,
      z.object({ data: AdSetSchema }),
    );
    return res.data.data;
  }

  async listAds(adSetId: string) {
    const res = await apiClient.get<{ data: Ad[] }>(
      `/api/paid-media/ad-sets/${adSetId}/ads`,
      z.object({ data: z.array(AdSchema) }),
    );
    return res.data.data;
  }

  async createAd(adSetId: string, input: Partial<Ad>) {
    const res = await apiClient.post<{ data: Ad }>(
      `/api/paid-media/ad-sets/${adSetId}/ads`,
      input,
      z.object({ data: AdSchema }),
    );
    return res.data.data;
  }

  async listCreatives(workspace?: WorkspaceParam | null) {
    const res = await apiClient.get<{ data: Creative[] }>(
      `/api/paid-media/creatives${wsQuery(workspace)}`,
      z.object({ data: z.array(CreativeSchema) }),
    );
    return res.data.data;
  }

  async createCreative(input: Partial<Creative>, workspace?: WorkspaceParam | null) {
    const res = await apiClient.post<{ data: Creative }>(
      `/api/paid-media/creatives${wsQuery(workspace)}`,
      input,
      z.object({ data: CreativeSchema }),
    );
    return res.data.data;
  }

  async pullInsights(args: {
    accountId: string;
    resourceKind: "campaign" | "ad_set" | "ad";
    externalIds?: string[];
    since: string;
    until: string;
  }) {
    const res = await apiClient.post<{ data: { count: number } }>(
      "/api/paid-media/insights/pull",
      args,
      z.object({ data: z.object({ count: z.number() }) }),
    );
    return res.data.data;
  }

  async listInsights(params: { internalId?: string; since?: string; until?: string }) {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null) as [string, string][]).toString();
    const res = await apiClient.get<{ data: Insight[] }>(
      `/api/paid-media/insights?${qs}`,
      z.object({ data: z.array(InsightSchema) }),
    );
    return res.data.data;
  }

  async getPixels(workspace?: WorkspaceParam | null) {
    const res = await apiClient.get<{ data: PixelConfig }>(
      `/api/paid-media/pixels${wsQuery(workspace)}`,
      z.object({ data: PixelConfigSchema }),
    );
    return res.data.data;
  }

  async savePixels(input: Partial<PixelConfig> & {
    metaCapiToken?: string | null;
    tiktokAccessToken?: string | null;
    linkedInCapiToken?: string | null;
    bingUetApiToken?: string | null;
    ga4ApiSecret?: string | null;
  }, workspace?: WorkspaceParam | null) {
    await apiClient.put(`/api/paid-media/pixels${wsQuery(workspace)}`, input);
  }

  /** Public — readable without auth (used by app shell). */
  async getPublicPixelConfig(workspaceUserId?: string, workspaceCompanyId?: string | null) {
    const qs = new URLSearchParams();
    if (workspaceUserId) qs.set("workspaceUserId", workspaceUserId);
    if (workspaceCompanyId) qs.set("workspaceCompanyId", workspaceCompanyId);
    // PublicPixelConfigSchema's `configured` is optional so the "not
    // configured" response (`{ configured: false }`) parses cleanly.
    const res = await apiClient.get<{ data: PublicPixelConfig }>(
      `/api/paid-media/pixels/public${qs.toString() ? `?${qs.toString()}` : ""}`,
      z.object({ data: PublicPixelConfigSchema }),
    );
    return res.data.data;
  }

  /** Record a server-side conversion. The backend fans out to every
   *  configured platform (CAPI). */
  async recordConversion(input: {
    workspaceUserId: string;
    workspaceCompanyId?: string | null;
    eventName: string;
    valueCents?: number | null;
    currencyCode?: string;
    userData?: { email?: string | null; phone?: string | null; externalId?: string | null };
    properties?: Record<string, unknown>;
    sourceUrl?: string | null;
  }) {
    const res = await apiClient.post<{ data: { id: string; delivery: Record<string, unknown> } }>(
      "/api/paid-media/conversions",
      input,
      z.object({ data: z.object({ id: z.string(), delivery: z.record(z.string(), z.unknown()) }) }),
    );
    return res.data.data;
  }
}

export const paidMediaService = new PaidMediaService();
