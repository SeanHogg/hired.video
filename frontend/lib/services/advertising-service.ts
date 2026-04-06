const API_BASE = import.meta.env.VITE_API_URL ?? "";

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

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("auth_token");
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
  }
  const json = await res.json();
  return json.data as T;
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
    body: JSON.stringify(data),
  }),

  pauseBoost: (id: string) => apiFetch<JobBoost>(`/advertising/boosts/${id}/pause`, { method: "PATCH" }),
  resumeBoost: (id: string) => apiFetch<JobBoost>(`/advertising/boosts/${id}/resume`, { method: "PATCH" }),
  cancelBoost: (id: string) => apiFetch<{ cancelled: boolean }>(`/advertising/boosts/${id}`, { method: "DELETE" }),

  // ── Campaigns ────────────────────────────────────────────────────────────
  getCampaigns: () => apiFetch<AdCampaign[]>("/api/advertising/campaigns"),

  createCampaign: (data: Partial<AdCampaign>) => apiFetch<AdCampaign>("/api/advertising/campaigns", {
    method: "POST",
    body: JSON.stringify(data),
  }),

  updateCampaign: (id: string, data: Partial<AdCampaign>) => apiFetch<AdCampaign>(`/advertising/campaigns/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  }),

  deleteCampaign: (id: string) => apiFetch<{ deleted: boolean }>(`/advertising/campaigns/${id}`, { method: "DELETE" }),

  // ── Ad Sets ──────────────────────────────────────────────────────────────
  getAdSets: (campaignId: string) => apiFetch<AdSet[]>(`/advertising/campaigns/${campaignId}/ad-sets`),

  createAdSet: (campaignId: string, data: Partial<AdSet>) => apiFetch<AdSet>(`/advertising/campaigns/${campaignId}/ad-sets`, {
    method: "POST",
    body: JSON.stringify(data),
  }),

  updateAdSet: (id: string, data: Partial<AdSet>) => apiFetch<AdSet>(`/advertising/ad-sets/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  }),

  deleteAdSet: (id: string) => apiFetch<{ deleted: boolean }>(`/advertising/ad-sets/${id}`, { method: "DELETE" }),

  // ── Ads ──────────────────────────────────────────────────────────────────
  getAds: (adSetId: string) => apiFetch<Ad[]>(`/advertising/ad-sets/${adSetId}/ads`),

  createAd: (adSetId: string, data: Partial<Ad>) => apiFetch<Ad>(`/advertising/ad-sets/${adSetId}/ads`, {
    method: "POST",
    body: JSON.stringify(data),
  }),

  updateAd: (id: string, data: Partial<Ad>) => apiFetch<Ad>(`/advertising/ads/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  }),

  deleteAd: (id: string) => apiFetch<{ deleted: boolean }>(`/advertising/ads/${id}`, { method: "DELETE" }),

  // ── Enrichment Credits ───────────────────────────────────────────────────
  getEnrichmentCredits: () => apiFetch<EnrichmentCredits>("/api/advertising/enrichment/credits"),

  enrichContact: (data: { email?: string; name?: string; company?: string }) =>
    apiFetch<Record<string, unknown>>("/api/advertising/enrichment/enrich", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};
