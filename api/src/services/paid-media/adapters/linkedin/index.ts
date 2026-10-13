/**
 * LinkedIn Ads adapter (Marketing Developer Platform).
 *
 * API reference:
 *   https://learn.microsoft.com/en-us/linkedin/marketing/
 *   https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/account-structure
 *
 * Hierarchy:
 *   Account → Campaign Group → Campaign (= our ad_set) → Creative (= our ad)
 *
 * We map our 3-tier hierarchy to LinkedIn's 4-tier as follows:
 *   our Campaign  → LinkedIn Campaign Group
 *   our Ad Set    → LinkedIn Campaign
 *   our Ad        → LinkedIn Creative
 *
 * API version: utils/linkedin-version (follows the calendar; never a pin).
 */

import {
  PaidMediaAdapterError,
  adapterFetch,
  type AdapterConfig,
  type PaidMediaAdapter,
} from "../../ports/adapter.js";
import { linkedInApiVersion } from "../../../../utils/linkedin-version.js";
import type {
  AdapterAdInput,
  AdapterAdSetInput,
  AdapterCampaignInput,
  AdapterCapabilities,
  AdapterContext,
  AdapterCreativeInput,
  AdapterResourceRef,
  InsightRow,
  InsightsQuery,
  ListedAdAccount,
  OAuthAuthUrlOptions,
  OAuthTokenSet,
  ResourceStatus,
  TargetingSpec,
} from "../../ports/types.js";

const LINKEDIN_API   = "https://api.linkedin.com/rest";
const LINKEDIN_AUTH  = "https://www.linkedin.com/oauth/v2/authorization";
const LINKEDIN_TOKEN = "https://www.linkedin.com/oauth/v2/accessToken";

const LINKEDIN_SCOPES = [
  "r_ads",
  "rw_ads",
  "r_ads_reporting",
  "r_organization_social",
].join(" ");

const LI_STATUS: Record<ResourceStatus, string> = {
  draft:     "DRAFT",
  active:    "ACTIVE",
  paused:    "PAUSED",
  archived:  "ARCHIVED",
  completed: "COMPLETED",
  error:     "PAUSED",
};

const LI_OBJECTIVE: Record<string, string> = {
  AWARENESS:        "BRAND_AWARENESS",
  TRAFFIC:          "WEBSITE_VISITS",
  LEAD_GENERATION:  "LEAD_GENERATION",
  CONVERSIONS:      "WEBSITE_CONVERSIONS",
  VIDEO_VIEWS:      "VIDEO_VIEWS",
  APP_INSTALLS:     "WEBSITE_VISITS",
  JOB_APPLICATIONS: "JOB_APPLICANTS",
};

function liHeaders(accessToken: string): HeadersInit {
  return {
    Authorization:            `Bearer ${accessToken}`,
    "LinkedIn-Version":       linkedInApiVersion(),
    "X-Restli-Protocol-Version": "2.0.0",
    "Content-Type":           "application/json",
  };
}

function liTargeting(spec: TargetingSpec): Record<string, unknown> {
  const t: Record<string, unknown> = {};
  const include: Record<string, unknown> = {};
  if (spec.geo?.countries?.length) {
    include.locations = spec.geo.countries.map((c) => `urn:li:geo:${c}`);
  }
  if (spec.industries?.length) {
    include.industries = spec.industries.map((i) => `urn:li:industry:${i}`);
  }
  if (spec.seniorities?.length) {
    include.seniorities = spec.seniorities.map((s) => `urn:li:seniority:${s}`);
  }
  if (spec.skills?.length) {
    include.skills = spec.skills.map((s) => `urn:li:skill:${s}`);
  }
  if (spec.jobTitles?.length) {
    include.titles = spec.jobTitles.map((j) => `urn:li:title:${j}`);
  }
  if (Object.keys(include).length) {
    t.includedTargetingFacets = include;
  }
  return t;
}

export function createLinkedInAdapter(config: AdapterConfig): PaidMediaAdapter {
  return {
    platform: "linkedin",
    config,

    capabilities(): AdapterCapabilities {
      return {
        targeting: ["geo", "industries", "seniorities", "jobTitles", "skills", "demographics", "customAudienceIds", "excludeAudienceIds"],
        objectives: ["AWARENESS", "TRAFFIC", "LEAD_GENERATION", "CONVERSIONS", "VIDEO_VIEWS", "JOB_APPLICATIONS"],
        supportsConversions: true,
        supportsReporting: true,
        supportsAudienceSync: true,
        docsUrl: "https://learn.microsoft.com/en-us/linkedin/marketing/",
      };
    },

    isConfigured() {
      return Boolean(config.clientId && config.clientSecret);
    },

    buildAuthUrl(opts: OAuthAuthUrlOptions): string {
      if (!config.clientId) throw new PaidMediaAdapterError("linkedin", "NOT_CONFIGURED", "Missing LINKEDIN_CLIENT_ID");
      const params = new URLSearchParams({
        response_type: "code",
        client_id:     config.clientId,
        redirect_uri:  opts.redirectUri,
        state:         opts.state,
        scope:         (opts.scopes ?? [LINKEDIN_SCOPES]).join(" "),
      });
      return `${LINKEDIN_AUTH}?${params.toString()}`;
    },

    async exchangeAuthCode(code: string, redirectUri: string): Promise<OAuthTokenSet> {
      if (!config.clientId || !config.clientSecret) {
        throw new PaidMediaAdapterError("linkedin", "NOT_CONFIGURED", "Missing LinkedIn credentials");
      }
      const res = await adapterFetch("linkedin", LINKEDIN_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type:    "authorization_code",
          code,
          client_id:     config.clientId,
          client_secret: config.clientSecret,
          redirect_uri:  redirectUri,
        }).toString(),
      });
      const t = await res.json() as { access_token: string; refresh_token?: string; expires_in: number; refresh_token_expires_in?: number; scope?: string };
      return {
        accessToken:  t.access_token,
        refreshToken: t.refresh_token ?? null,
        expiresAt:    new Date(Date.now() + (t.expires_in - 30) * 1000),
        scopes:       t.scope ?? LINKEDIN_SCOPES,
      };
    },

    async refreshAccessToken(refreshToken: string): Promise<OAuthTokenSet> {
      if (!config.clientId || !config.clientSecret) {
        throw new PaidMediaAdapterError("linkedin", "NOT_CONFIGURED", "Missing LinkedIn credentials");
      }
      const res = await adapterFetch("linkedin", LINKEDIN_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type:    "refresh_token",
          refresh_token: refreshToken,
          client_id:     config.clientId,
          client_secret: config.clientSecret,
        }).toString(),
      });
      const t = await res.json() as { access_token: string; expires_in: number; refresh_token?: string };
      return {
        accessToken:  t.access_token,
        refreshToken: t.refresh_token ?? refreshToken,
        expiresAt:    new Date(Date.now() + (t.expires_in - 30) * 1000),
        scopes:       LINKEDIN_SCOPES,
      };
    },

    async listAdAccounts(accessToken: string): Promise<ListedAdAccount[]> {
      const res = await adapterFetch("linkedin", `${LINKEDIN_API}/adAccounts?q=search&search.type.values[0]=BUSINESS&search.status.values[0]=ACTIVE`, {
        method: "GET",
        headers: liHeaders(accessToken),
      });
      const data = await res.json() as { elements?: Array<any> };
      return (data.elements ?? []).map((a) => ({
        externalAccountId: String(a.id),
        name:              a.name ?? `Account ${a.id}`,
        currencyCode:      a.currency,
        metadata:          { type: a.type, status: a.status },
      }));
    },

    async createCampaign(ctx: AdapterContext, input: AdapterCampaignInput): Promise<AdapterResourceRef> {
      // LinkedIn "Campaign Group" = our Campaign.
      const res = await adapterFetch("linkedin", `${LINKEDIN_API}/adCampaignGroups`, {
        method: "POST",
        headers: liHeaders(ctx.accessToken),
        body: JSON.stringify({
          account: `urn:li:sponsoredAccount:${ctx.externalAccountId}`,
          name:    input.name,
          status:  LI_STATUS[input.status],
          ...(input.budgetCents != null ? { totalBudget: { amount: String(input.budgetCents / 100), currencyCode: input.currencyCode } } : {}),
          ...(input.startAt ? { runSchedule: { start: input.startAt.getTime(), ...(input.endAt ? { end: input.endAt.getTime() } : {}) } } : {}),
        }),
      });
      const location = res.headers.get("location") ?? res.headers.get("x-restli-id");
      const id = location ? location.split("/").pop()! : (await res.json() as any).id;
      return { externalId: String(id), externalUrl: `https://www.linkedin.com/campaignmanager/accounts/${ctx.externalAccountId}/campaign-groups/${id}` };
    },

    async updateCampaign(ctx: AdapterContext, externalId: string, input: Partial<AdapterCampaignInput>): Promise<AdapterResourceRef> {
      const patch: Record<string, unknown> = { patch: { $set: {} as Record<string, unknown> } };
      const set = (patch.patch as any).$set;
      if (input.name)   set.name = input.name;
      if (input.status) set.status = LI_STATUS[input.status];
      await adapterFetch("linkedin", `${LINKEDIN_API}/adCampaignGroups/${externalId}`, {
        method: "POST",
        headers: { ...liHeaders(ctx.accessToken), "X-RestLi-Method": "PARTIAL_UPDATE" },
        body: JSON.stringify(patch),
      });
      return { externalId };
    },

    async deleteCampaign(ctx: AdapterContext, externalId: string): Promise<void> {
      await adapterFetch("linkedin", `${LINKEDIN_API}/adCampaignGroups/${externalId}`, {
        method: "DELETE",
        headers: liHeaders(ctx.accessToken),
      });
    },

    async createAdSet(ctx: AdapterContext, input: AdapterAdSetInput): Promise<AdapterResourceRef> {
      const res = await adapterFetch("linkedin", `${LINKEDIN_API}/adCampaigns`, {
        method: "POST",
        headers: liHeaders(ctx.accessToken),
        body: JSON.stringify({
          account:         `urn:li:sponsoredAccount:${ctx.externalAccountId}`,
          campaignGroup:   `urn:li:sponsoredCampaignGroup:${input.externalCampaignId}`,
          name:            input.name,
          status:          LI_STATUS[input.status],
          type:            "SPONSORED_UPDATES",
          objectiveType:   LI_OBJECTIVE[input.optimizationGoal] ?? "WEBSITE_VISITS",
          costType:        input.bidStrategy === "AUTO" ? "CPM" : "CPC",
          ...(input.bidAmountCents
            ? { unitCost: { amount: String(input.bidAmountCents / 100), currencyCode: "USD" } }
            : {}),
          ...(input.dailyBudgetCents != null
            ? { dailyBudget: { amount: String(input.dailyBudgetCents / 100), currencyCode: "USD" } }
            : {}),
          ...(input.lifetimeBudgetCents != null
            ? { totalBudget: { amount: String(input.lifetimeBudgetCents / 100), currencyCode: "USD" } }
            : {}),
          targetingCriteria: liTargeting(input.targeting),
          ...(input.startAt
            ? { runSchedule: { start: input.startAt.getTime(), ...(input.endAt ? { end: input.endAt.getTime() } : {}) } }
            : {}),
        }),
      });
      const id = res.headers.get("x-restli-id") ?? (await res.json() as any).id;
      return { externalId: String(id) };
    },

    async updateAdSet(ctx: AdapterContext, externalId: string, input: Partial<AdapterAdSetInput>): Promise<AdapterResourceRef> {
      const set: Record<string, unknown> = {};
      if (input.name)   set.name = input.name;
      if (input.status) set.status = LI_STATUS[input.status];
      if (input.targeting) set.targetingCriteria = liTargeting(input.targeting);
      await adapterFetch("linkedin", `${LINKEDIN_API}/adCampaigns/${externalId}`, {
        method: "POST",
        headers: { ...liHeaders(ctx.accessToken), "X-RestLi-Method": "PARTIAL_UPDATE" },
        body: JSON.stringify({ patch: { $set: set } }),
      });
      return { externalId };
    },

    async deleteAdSet(ctx: AdapterContext, externalId: string): Promise<void> {
      await adapterFetch("linkedin", `${LINKEDIN_API}/adCampaigns/${externalId}`, {
        method: "DELETE",
        headers: liHeaders(ctx.accessToken),
      });
    },

    async createCreative(ctx: AdapterContext, input: AdapterCreativeInput): Promise<AdapterResourceRef> {
      // LinkedIn separates "Creative" (per-Campaign reference) from "Post"
      // (the underlying share). We assume metadata.organizationUrn + a
      // pre-shared post URN are supplied by the service layer.
      const organizationUrn = (input as any).metadata?.organizationUrn;
      const shareUrn        = (input as any).metadata?.shareUrn;
      if (!organizationUrn) {
        throw new PaidMediaAdapterError("linkedin", "VALIDATION_ERROR", "LinkedIn creative requires metadata.organizationUrn");
      }
      if (!shareUrn) {
        throw new PaidMediaAdapterError("linkedin", "VALIDATION_ERROR", "LinkedIn creative requires metadata.shareUrn (pre-uploaded post)");
      }
      // A creative is created at ad-creation time; return a synthetic id
      // that the service layer carries to createAd().
      return { externalId: `synthetic:${shareUrn}` };
    },

    async createAd(ctx: AdapterContext, input: AdapterAdInput): Promise<AdapterResourceRef> {
      // input.externalCreativeId is "synthetic:<shareUrn>" per createCreative().
      const shareUrn = input.externalCreativeId.startsWith("synthetic:")
        ? input.externalCreativeId.slice("synthetic:".length)
        : input.externalCreativeId;
      const res = await adapterFetch("linkedin", `${LINKEDIN_API}/adAccounts/${ctx.externalAccountId}/creatives`, {
        method: "POST",
        headers: { ...liHeaders(ctx.accessToken), "X-RestLi-Method": "CREATE" },
        body: JSON.stringify({
          campaign: `urn:li:sponsoredCampaign:${input.externalAdSetId}`,
          inlineContent: { reference: shareUrn },
          intendedStatus: LI_STATUS[input.status],
        }),
      });
      const id = res.headers.get("x-restli-id") ?? (await res.json() as any).id;
      return { externalId: String(id) };
    },

    async updateAd(ctx: AdapterContext, externalId: string, input: Partial<AdapterAdInput>): Promise<AdapterResourceRef> {
      const set: Record<string, unknown> = {};
      if (input.status) set.intendedStatus = LI_STATUS[input.status];
      await adapterFetch("linkedin", `${LINKEDIN_API}/adAccounts/${ctx.externalAccountId}/creatives/${externalId}`, {
        method: "POST",
        headers: { ...liHeaders(ctx.accessToken), "X-RestLi-Method": "PARTIAL_UPDATE" },
        body: JSON.stringify({ patch: { $set: set } }),
      });
      return { externalId };
    },

    async deleteAd(ctx: AdapterContext, externalId: string): Promise<void> {
      await adapterFetch("linkedin", `${LINKEDIN_API}/adAccounts/${ctx.externalAccountId}/creatives/${externalId}`, {
        method: "DELETE",
        headers: liHeaders(ctx.accessToken),
      });
    },

    async pullInsights(ctx: AdapterContext, query: InsightsQuery): Promise<InsightRow[]> {
      const pivot = query.resourceKind === "campaign" ? "CAMPAIGN_GROUP" : query.resourceKind === "ad_set" ? "CAMPAIGN" : "CREATIVE";
      const urnPrefix = query.resourceKind === "campaign" ? "sponsoredCampaignGroup" : query.resourceKind === "ad_set" ? "sponsoredCampaign" : "sponsoredCreative";
      const params = new URLSearchParams({
        q:           "analytics",
        pivot,
        timeGranularity: "DAILY",
        dateRange:   `(start:(year:${query.since.slice(0,4)},month:${Number(query.since.slice(5,7))},day:${Number(query.since.slice(8,10))}),end:(year:${query.until.slice(0,4)},month:${Number(query.until.slice(5,7))},day:${Number(query.until.slice(8,10))}))`,
        fields:      "dateRange,impressions,clicks,costInLocalCurrency,externalWebsiteConversions,videoViews,pivotValues",
      });
      if (query.externalIds?.length) {
        params.set("accounts", `List(urn:li:sponsoredAccount:${ctx.externalAccountId})`);
        params.set("campaigns", `List(${query.externalIds.map((id) => `urn:li:${urnPrefix}:${id}`).join(",")})`);
      } else {
        params.set("accounts", `List(urn:li:sponsoredAccount:${ctx.externalAccountId})`);
      }
      const res = await adapterFetch("linkedin", `${LINKEDIN_API}/adAnalytics?${params.toString()}`, {
        method: "GET",
        headers: liHeaders(ctx.accessToken),
      });
      const data = await res.json() as { elements?: Array<any> };
      return (data.elements ?? []).map((r) => {
        const pivotUrn = (r.pivotValues ?? [])[0] ?? "";
        const externalId = String(pivotUrn).split(":").pop() ?? "";
        const d = r.dateRange?.start;
        const date = d ? `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}` : query.since;
        return {
          externalId,
          resourceKind: query.resourceKind,
          date,
          impressions: Number(r.impressions ?? 0),
          clicks:      Number(r.clicks ?? 0),
          spendCents:  Math.round(Number(r.costInLocalCurrency ?? 0) * 100),
          conversions: Number(r.externalWebsiteConversions ?? 0),
          videoViews:  Number(r.videoViews ?? 0),
          rawMetrics:  r,
        };
      });
    },
  };
}
