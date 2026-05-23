/**
 * Google Ads adapter.
 *
 * API reference:
 *   https://developers.google.com/google-ads/api/rest/overview
 *   https://developers.google.com/google-ads/api/rest/auth
 *
 * Authentication:
 *   - OAuth 2.0 (standard Google flow, scope = adwords)
 *   - Developer token must be sent on every request as `developer-token` header
 *
 * Pinned API version: v16
 */

import {
  PaidMediaAdapterError,
  adapterFetch,
  type AdapterConfig,
  type PaidMediaAdapter,
} from "../../ports/adapter.js";
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
} from "../../ports/types.js";

const GOOGLE_API_VERSION = "v16";
const GOOGLE_ADS_API   = `https://googleads.googleapis.com/${GOOGLE_API_VERSION}`;
const GOOGLE_AUTH      = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN     = "https://oauth2.googleapis.com/token";
const GOOGLE_SCOPES    = "https://www.googleapis.com/auth/adwords";

const G_STATUS: Record<ResourceStatus, "ENABLED" | "PAUSED" | "REMOVED"> = {
  draft:     "PAUSED",
  active:    "ENABLED",
  paused:    "PAUSED",
  archived:  "REMOVED",
  completed: "REMOVED",
  error:     "PAUSED",
};

const G_CHANNEL: Record<string, string> = {
  AWARENESS:        "DISPLAY",
  TRAFFIC:          "SEARCH",
  LEAD_GENERATION:  "SEARCH",
  CONVERSIONS:      "SEARCH",
  VIDEO_VIEWS:      "VIDEO",
  APP_INSTALLS:     "MULTI_CHANNEL",
  JOB_APPLICATIONS: "SEARCH",
};

function gAuthHeaders(accessToken: string, developerToken: string, externalAccountId: string): HeadersInit {
  return {
    Authorization:     `Bearer ${accessToken}`,
    "developer-token": developerToken,
    "login-customer-id": externalAccountId.replace(/-/g, ""),
    "Content-Type":    "application/json",
  };
}

function assertConfigured(config: AdapterConfig): asserts config is AdapterConfig & {
  clientId: string;
  clientSecret: string;
  developerToken: string;
} {
  if (!config.clientId || !config.clientSecret) {
    throw new PaidMediaAdapterError("google", "NOT_CONFIGURED", "Missing GOOGLE_CLIENT_ID/SECRET");
  }
  if (!config.developerToken) {
    throw new PaidMediaAdapterError("google", "NOT_CONFIGURED", "Missing GOOGLE_ADS_DEVELOPER_TOKEN");
  }
}

export function createGoogleAdsAdapter(config: AdapterConfig): PaidMediaAdapter {
  return {
    platform: "google",
    config,

    capabilities(): AdapterCapabilities {
      return {
        targeting: [
          "geo", "demographics", "interests",
          "customAudienceIds", "excludeAudienceIds",
          "placements", "devicePlatforms", "operatingSystems",
        ],
        objectives: ["AWARENESS", "TRAFFIC", "LEAD_GENERATION", "CONVERSIONS", "VIDEO_VIEWS", "APP_INSTALLS"],
        supportsConversions: true,
        supportsReporting: true,
        supportsAudienceSync: true,
        docsUrl: "https://developers.google.com/google-ads/api/rest/overview",
      };
    },

    isConfigured() {
      return Boolean(config.clientId && config.clientSecret && config.developerToken);
    },

    buildAuthUrl(opts: OAuthAuthUrlOptions): string {
      if (!config.clientId) throw new PaidMediaAdapterError("google", "NOT_CONFIGURED", "Missing GOOGLE_CLIENT_ID");
      const params = new URLSearchParams({
        client_id:     config.clientId,
        redirect_uri:  opts.redirectUri,
        state:         opts.state,
        scope:         (opts.scopes ?? [GOOGLE_SCOPES]).join(" "),
        response_type: "code",
        access_type:   "offline",
        prompt:        "consent", // ensures refresh_token issued on reconnect
      });
      return `${GOOGLE_AUTH}?${params.toString()}`;
    },

    async exchangeAuthCode(code: string, redirectUri: string): Promise<OAuthTokenSet> {
      assertConfigured(config);
      const res = await adapterFetch("google", GOOGLE_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id:     config.clientId,
          client_secret: config.clientSecret,
          redirect_uri:  redirectUri,
          grant_type:    "authorization_code",
        }).toString(),
      });
      const t = await res.json() as { access_token: string; refresh_token?: string; expires_in: number; scope: string };
      return {
        accessToken:  t.access_token,
        refreshToken: t.refresh_token ?? null,
        expiresAt:    new Date(Date.now() + (t.expires_in - 30) * 1000),
        scopes:       t.scope,
      };
    },

    async refreshAccessToken(refreshToken: string): Promise<OAuthTokenSet> {
      assertConfigured(config);
      const res = await adapterFetch("google", GOOGLE_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          refresh_token: refreshToken,
          client_id:     config.clientId,
          client_secret: config.clientSecret,
          grant_type:    "refresh_token",
        }).toString(),
      });
      const t = await res.json() as { access_token: string; expires_in: number; scope: string };
      return {
        accessToken:  t.access_token,
        refreshToken,
        expiresAt:    new Date(Date.now() + (t.expires_in - 30) * 1000),
        scopes:       t.scope,
      };
    },

    async listAdAccounts(accessToken: string): Promise<ListedAdAccount[]> {
      assertConfigured(config);
      // /customers:listAccessibleCustomers returns resource names like "customers/1234567890"
      const res = await adapterFetch("google", `${GOOGLE_ADS_API}/customers:listAccessibleCustomers`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}`, "developer-token": config.developerToken },
      });
      const list = await res.json() as { resourceNames?: string[] };
      const accounts: ListedAdAccount[] = [];
      for (const rn of list.resourceNames ?? []) {
        const id = rn.split("/")[1];
        if (!id) continue;
        // Fetch details with a GAQL search.
        try {
          const detailRes = await adapterFetch("google", `${GOOGLE_ADS_API}/customers/${id}/googleAds:search`, {
            method: "POST",
            headers: gAuthHeaders(accessToken, config.developerToken, id),
            body: JSON.stringify({ query: "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer LIMIT 1" }),
          });
          const detail = await detailRes.json() as { results?: Array<{ customer?: any }> };
          const c = detail.results?.[0]?.customer;
          accounts.push({
            externalAccountId: id,
            name:              c?.descriptiveName ?? `Account ${id}`,
            currencyCode:      c?.currencyCode,
            timeZone:          c?.timeZone,
          });
        } catch {
          accounts.push({ externalAccountId: id, name: `Account ${id}` });
        }
      }
      return accounts;
    },

    async createCampaign(ctx: AdapterContext, input: AdapterCampaignInput): Promise<AdapterResourceRef> {
      assertConfigured(config);
      // Google Ads requires a campaign_budget resource first.
      const budgetRes = await adapterFetch("google", `${GOOGLE_ADS_API}/customers/${ctx.externalAccountId}/campaignBudgets:mutate`, {
        method: "POST",
        headers: gAuthHeaders(ctx.accessToken, config.developerToken, ctx.externalAccountId),
        body: JSON.stringify({
          operations: [{
            create: {
              name:           `${input.name} budget`,
              amountMicros:   String((input.dailyBudgetCents ?? input.budgetCents ?? 1000) * 10_000), // cents → micros (1 unit = 1M)
              deliveryMethod: "STANDARD",
            },
          }],
        }),
      });
      const budgetJson = await budgetRes.json() as { results?: Array<{ resourceName?: string }> };
      const budgetResource = budgetJson.results?.[0]?.resourceName;
      if (!budgetResource) throw new PaidMediaAdapterError("google", "API_ERROR", "Failed to create campaign budget");

      const res = await adapterFetch("google", `${GOOGLE_ADS_API}/customers/${ctx.externalAccountId}/campaigns:mutate`, {
        method: "POST",
        headers: gAuthHeaders(ctx.accessToken, config.developerToken, ctx.externalAccountId),
        body: JSON.stringify({
          operations: [{
            create: {
              name:                       input.name,
              advertisingChannelType:     G_CHANNEL[input.objective] ?? "SEARCH",
              status:                     G_STATUS[input.status],
              campaignBudget:             budgetResource,
              manualCpc:                  { enhancedCpcEnabled: true },
              ...(input.startAt ? { startDate: input.startAt.toISOString().slice(0, 10).replace(/-/g, "") } : {}),
              ...(input.endAt   ? { endDate:   input.endAt.toISOString().slice(0, 10).replace(/-/g, "") } : {}),
            },
          }],
        }),
      });
      const data = await res.json() as { results?: Array<{ resourceName?: string }> };
      const rn = data.results?.[0]?.resourceName;
      if (!rn) throw new PaidMediaAdapterError("google", "API_ERROR", "Failed to create campaign");
      const id = rn.split("/").pop()!;
      return { externalId: id, externalUrl: `https://ads.google.com/aw/campaigns?campaignId=${id}`, raw: data };
    },

    async updateCampaign(ctx: AdapterContext, externalId: string, input: Partial<AdapterCampaignInput>): Promise<AdapterResourceRef> {
      assertConfigured(config);
      const update: Record<string, unknown> = {
        resourceName: `customers/${ctx.externalAccountId}/campaigns/${externalId}`,
      };
      const paths: string[] = [];
      if (input.name)   { update.name = input.name; paths.push("name"); }
      if (input.status) { update.status = G_STATUS[input.status]; paths.push("status"); }
      const res = await adapterFetch("google", `${GOOGLE_ADS_API}/customers/${ctx.externalAccountId}/campaigns:mutate`, {
        method: "POST",
        headers: gAuthHeaders(ctx.accessToken, config.developerToken, ctx.externalAccountId),
        body: JSON.stringify({ operations: [{ update, updateMask: paths.join(",") }] }),
      });
      return { externalId, raw: await res.json() };
    },

    async deleteCampaign(ctx: AdapterContext, externalId: string): Promise<void> {
      assertConfigured(config);
      await adapterFetch("google", `${GOOGLE_ADS_API}/customers/${ctx.externalAccountId}/campaigns:mutate`, {
        method: "POST",
        headers: gAuthHeaders(ctx.accessToken, config.developerToken, ctx.externalAccountId),
        body: JSON.stringify({
          operations: [{ remove: `customers/${ctx.externalAccountId}/campaigns/${externalId}` }],
        }),
      });
    },

    async createAdSet(ctx: AdapterContext, input: AdapterAdSetInput): Promise<AdapterResourceRef> {
      assertConfigured(config);
      // Google Ads uses "AdGroup" as the ad-set equivalent.
      const res = await adapterFetch("google", `${GOOGLE_ADS_API}/customers/${ctx.externalAccountId}/adGroups:mutate`, {
        method: "POST",
        headers: gAuthHeaders(ctx.accessToken, config.developerToken, ctx.externalAccountId),
        body: JSON.stringify({
          operations: [{
            create: {
              name:     input.name,
              campaign: `customers/${ctx.externalAccountId}/campaigns/${input.externalCampaignId}`,
              status:   G_STATUS[input.status],
              type:     "SEARCH_STANDARD",
              ...(input.bidAmountCents ? { cpcBidMicros: String(input.bidAmountCents * 10_000) } : {}),
            },
          }],
        }),
      });
      const data = await res.json() as { results?: Array<{ resourceName?: string }> };
      const id = data.results?.[0]?.resourceName?.split("/").pop();
      if (!id) throw new PaidMediaAdapterError("google", "API_ERROR", "Failed to create ad group");
      // TODO: apply geo/demographic targeting via campaignCriterion / adGroupCriterion mutates.
      // Tracked under gap #PM-G1 in Consolidated Gap Register.
      return { externalId: id, raw: data };
    },

    async updateAdSet(ctx: AdapterContext, externalId: string, input: Partial<AdapterAdSetInput>): Promise<AdapterResourceRef> {
      assertConfigured(config);
      const update: Record<string, unknown> = { resourceName: `customers/${ctx.externalAccountId}/adGroups/${externalId}` };
      const paths: string[] = [];
      if (input.name)   { update.name = input.name; paths.push("name"); }
      if (input.status) { update.status = G_STATUS[input.status]; paths.push("status"); }
      const res = await adapterFetch("google", `${GOOGLE_ADS_API}/customers/${ctx.externalAccountId}/adGroups:mutate`, {
        method: "POST",
        headers: gAuthHeaders(ctx.accessToken, config.developerToken, ctx.externalAccountId),
        body: JSON.stringify({ operations: [{ update, updateMask: paths.join(",") }] }),
      });
      return { externalId, raw: await res.json() };
    },

    async deleteAdSet(ctx: AdapterContext, externalId: string): Promise<void> {
      assertConfigured(config);
      await adapterFetch("google", `${GOOGLE_ADS_API}/customers/${ctx.externalAccountId}/adGroups:mutate`, {
        method: "POST",
        headers: gAuthHeaders(ctx.accessToken, config.developerToken, ctx.externalAccountId),
        body: JSON.stringify({
          operations: [{ remove: `customers/${ctx.externalAccountId}/adGroups/${externalId}` }],
        }),
      });
    },

    async createCreative(ctx: AdapterContext, input: AdapterCreativeInput): Promise<AdapterResourceRef> {
      // Google Ads doesn't have a standalone "creative" object — assets
      // attach to ads directly. We return a synthetic id and the
      // ad-create call resolves it. Records the creative in our DB so
      // the same internal creative can be reused across multiple ads.
      return { externalId: `synthetic:${input.internalId}`, raw: { synthetic: true } };
    },

    async createAd(ctx: AdapterContext, input: AdapterAdInput): Promise<AdapterResourceRef> {
      assertConfigured(config);
      // Responsive Search Ad. Headlines/descriptions are pulled from the
      // service layer projection (which merged Ad + Creative when calling).
      const headlines = ((input as any).headlines ?? [(input as any).headline ?? "Sign up"]) as string[];
      const descriptions = ((input as any).descriptions ?? [(input as any).description ?? "Get started today"]) as string[];

      const res = await adapterFetch("google", `${GOOGLE_ADS_API}/customers/${ctx.externalAccountId}/adGroupAds:mutate`, {
        method: "POST",
        headers: gAuthHeaders(ctx.accessToken, config.developerToken, ctx.externalAccountId),
        body: JSON.stringify({
          operations: [{
            create: {
              adGroup: `customers/${ctx.externalAccountId}/adGroups/${input.externalAdSetId}`,
              status:  G_STATUS[input.status],
              ad: {
                name: input.name,
                finalUrls: [input.destinationUrl],
                responsiveSearchAd: {
                  headlines:    headlines.slice(0, 15).map((text) => ({ text })),
                  descriptions: descriptions.slice(0, 4).map((text) => ({ text })),
                },
              },
            },
          }],
        }),
      });
      const data = await res.json() as { results?: Array<{ resourceName?: string }> };
      const id = data.results?.[0]?.resourceName?.split("/").pop();
      if (!id) throw new PaidMediaAdapterError("google", "API_ERROR", "Failed to create ad");
      return { externalId: id, raw: data };
    },

    async updateAd(ctx: AdapterContext, externalId: string, input: Partial<AdapterAdInput>): Promise<AdapterResourceRef> {
      assertConfigured(config);
      const update: Record<string, unknown> = { resourceName: `customers/${ctx.externalAccountId}/adGroupAds/${externalId}` };
      const paths: string[] = [];
      if (input.status) { update.status = G_STATUS[input.status]; paths.push("status"); }
      const res = await adapterFetch("google", `${GOOGLE_ADS_API}/customers/${ctx.externalAccountId}/adGroupAds:mutate`, {
        method: "POST",
        headers: gAuthHeaders(ctx.accessToken, config.developerToken, ctx.externalAccountId),
        body: JSON.stringify({ operations: [{ update, updateMask: paths.join(",") }] }),
      });
      return { externalId, raw: await res.json() };
    },

    async deleteAd(ctx: AdapterContext, externalId: string): Promise<void> {
      assertConfigured(config);
      await adapterFetch("google", `${GOOGLE_ADS_API}/customers/${ctx.externalAccountId}/adGroupAds:mutate`, {
        method: "POST",
        headers: gAuthHeaders(ctx.accessToken, config.developerToken, ctx.externalAccountId),
        body: JSON.stringify({ operations: [{ remove: `customers/${ctx.externalAccountId}/adGroupAds/${externalId}` }] }),
      });
    },

    async pullInsights(ctx: AdapterContext, query: InsightsQuery): Promise<InsightRow[]> {
      assertConfigured(config);
      const resourceTable = query.resourceKind === "campaign" ? "campaign" : query.resourceKind === "ad_set" ? "ad_group" : "ad_group_ad";
      const idField = query.resourceKind === "campaign" ? "campaign.id" : query.resourceKind === "ad_set" ? "ad_group.id" : "ad_group_ad.ad.id";
      const where: string[] = [`segments.date BETWEEN '${query.since}' AND '${query.until}'`];
      if (query.externalIds?.length) {
        where.push(`${idField} IN (${query.externalIds.map((id) => `'${id}'`).join(",")})`);
      }
      const gaql = `SELECT ${idField}, segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.video_views FROM ${resourceTable} WHERE ${where.join(" AND ")}`;
      const res = await adapterFetch("google", `${GOOGLE_ADS_API}/customers/${ctx.externalAccountId}/googleAds:search`, {
        method: "POST",
        headers: gAuthHeaders(ctx.accessToken, config.developerToken, ctx.externalAccountId),
        body: JSON.stringify({ query: gaql }),
      });
      const data = await res.json() as { results?: Array<any> };
      return (data.results ?? []).map((r) => {
        const externalId =
          r.campaign?.id ?? r.adGroup?.id ?? r.adGroupAd?.ad?.id ?? "";
        return {
          externalId: String(externalId),
          resourceKind: query.resourceKind,
          date:        r.segments?.date ?? query.since,
          impressions: Number(r.metrics?.impressions ?? 0),
          clicks:      Number(r.metrics?.clicks ?? 0),
          spendCents:  Math.round(Number(r.metrics?.costMicros ?? 0) / 10_000),
          conversions: Math.round(Number(r.metrics?.conversions ?? 0)),
          videoViews:  Number(r.metrics?.videoViews ?? 0),
          rawMetrics:  r,
        };
      });
    },
  };
}
