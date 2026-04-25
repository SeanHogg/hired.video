import { apiClient } from "@/lib/api-client";
import type { RequestConfig } from "@/lib/api-client";

export interface JobBoost {
  id: string;
  jobId: string;
  jobTitle?: string;
  placementType: "search_top" | "discovery_feed" | "both";
  pricingModel: "cpm" | "cpc";
  budgetCents: number;
  budgetDollars: number;
  spentCents: number;
  spentDollars: number;
  rateUnitCents: number;
  status: "active" | "paused" | "completed" | "cancelled";
  impressions: number;
  clicks: number;
  applications: number;
  ctr: number;
  costPerClick: number | null;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
}

export interface AdCampaign {
  id: string;
  userId: string;
  name: string;
  objective: "AWARENESS" | "TRAFFIC" | "APPLICATIONS" | "EMPLOYER_BRAND";
  status: "draft" | "active" | "paused" | "completed" | "archived";
  budgetCents: number | null;
  spentCents: number;
  startAt: string | null;
  endAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdSet {
  id: string;
  campaignId: string;
  name: string;
  placementType: string;
  pricingModel: string;
  bidStrategy: string;
  bidAmountCents: number | null;
  budgetCents: number | null;
  spentCents: number;
  targetingJson: Record<string, unknown>;
  frequencyCapCount: number | null;
  frequencyCapHours: number | null;
  status: string;
  impressions: number;
  clicks: number;
  applications: number;
  startAt: string | null;
  endAt: string | null;
}

export interface Ad {
  id: string;
  adSetId: string;
  name: string;
  headline: string;
  description: string | null;
  ctaText: string;
  ctaUrl: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  destinationUrl: string | null;
  variantGroup: "A" | "B" | null;
  status: string;
  impressions: number;
  clicks: number;
  ctr: number;
}

export interface AdvertisingStats {
  totalSpentDollars: number;
  totalImpressions: number;
  totalClicks: number;
  totalApplications: number;
  ctr: number;
  costPerClick: number | null;
  costPerApplication: number | null;
  activeBoosts: number;
  activeCampaigns: number;
  totalCampaigns: number;
}

export interface EnrichmentCredits {
  id: string;
  userId: string;
  balance: number;
  totalPurchased: number;
  totalConsumed: number;
}

// Routes through apiClient so URL construction (api.hired.video vs hired.video),
// auth header injection, and error normalization match the rest of the app.
// Returns the unwrapped `data` payload directly — callers expect `T`, not the
// `{ success, data }` envelope.
async function apiFetch<T>(path: string, init?: { method?: RequestConfig["method"]; body?: unknown }): Promise<T> {
  const res = await apiClient.request<T>(path, {
    method: init?.method ?? "GET",
    body: init?.body,
  });
  return res.data;
}

export const advertisingService = {
  // ── Stats ────────────────────────────────────────────────────────────────
  getStats: () => apiFetch<AdvertisingStats>("/api/advertising/stats"),

  // ── Job Boosts ───────────────────────────────────────────────────────────
  getBoosts: () => apiFetch<JobBoost[]>("/api/advertising/boosts"),

  createBoost: (data: {
    jobId: string;
    placementType: "search_top" | "discovery_feed" | "both";
    pricingModel: "cpm" | "cpc";
    budgetCents: number;
    durationDays: number;
  }) => apiFetch<JobBoost>("/api/advertising/boosts", {
    method: "POST",
    body: data,
  }),

  pauseBoost: (id: string) => apiFetch<JobBoost>(`/api/advertising/boosts/${id}/pause`, { method: "PATCH" }),
  resumeBoost: (id: string) => apiFetch<JobBoost>(`/api/advertising/boosts/${id}/resume`, { method: "PATCH" }),
  cancelBoost: (id: string) => apiFetch<{ cancelled: boolean }>(`/api/advertising/boosts/${id}`, { method: "DELETE" }),

  // ── Campaigns ────────────────────────────────────────────────────────────
  getCampaigns: () => apiFetch<AdCampaign[]>("/api/advertising/campaigns"),

  createCampaign: (data: Partial<AdCampaign>) => apiFetch<AdCampaign>("/api/advertising/campaigns", {
    method: "POST",
    body: data,
  }),

  updateCampaign: (id: string, data: Partial<AdCampaign>) => apiFetch<AdCampaign>(`/api/advertising/campaigns/${id}`, {
    method: "PUT",
    body: data,
  }),

  deleteCampaign: (id: string) => apiFetch<{ deleted: boolean }>(`/api/advertising/campaigns/${id}`, { method: "DELETE" }),

  // ── Ad Sets ──────────────────────────────────────────────────────────────
  getAdSets: (campaignId: string) => apiFetch<AdSet[]>(`/api/advertising/campaigns/${campaignId}/ad-sets`),

  createAdSet: (campaignId: string, data: Partial<AdSet>) => apiFetch<AdSet>(`/api/advertising/campaigns/${campaignId}/ad-sets`, {
    method: "POST",
    body: data,
  }),

  updateAdSet: (id: string, data: Partial<AdSet>) => apiFetch<AdSet>(`/api/advertising/ad-sets/${id}`, {
    method: "PUT",
    body: data,
  }),

  deleteAdSet: (id: string) => apiFetch<{ deleted: boolean }>(`/api/advertising/ad-sets/${id}`, { method: "DELETE" }),

  // ── Ads ──────────────────────────────────────────────────────────────────
  getAds: (adSetId: string) => apiFetch<Ad[]>(`/api/advertising/ad-sets/${adSetId}/ads`),

  createAd: (adSetId: string, data: Partial<Ad>) => apiFetch<Ad>(`/api/advertising/ad-sets/${adSetId}/ads`, {
    method: "POST",
    body: data,
  }),

  updateAd: (id: string, data: Partial<Ad>) => apiFetch<Ad>(`/api/advertising/ads/${id}`, {
    method: "PUT",
    body: data,
  }),

  deleteAd: (id: string) => apiFetch<{ deleted: boolean }>(`/api/advertising/ads/${id}`, { method: "DELETE" }),

  // ── Enrichment Credits ───────────────────────────────────────────────────
  getEnrichmentCredits: () => apiFetch<EnrichmentCredits>("/api/advertising/enrichment/credits"),

  enrichContact: (data: { email?: string; name?: string; company?: string }) =>
    apiFetch<Record<string, unknown>>("/api/advertising/enrichment/enrich", {
      method: "POST",
      body: data,
    }),
};
