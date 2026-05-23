/**
 * Microsoft Advertising (Bing Ads) adapter.
 *
 * API reference:
 *   https://learn.microsoft.com/en-us/advertising/guides/
 *   https://learn.microsoft.com/en-us/advertising/customer-management-service/
 *
 * Microsoft Ads historically used SOAP — there is now a REST surface
 * ("Advertising APIs") in GA. We use the REST surface; SOAP-only
 * endpoints are stubbed and flagged in the gap register.
 *
 * Authentication: OAuth 2.0 (Microsoft identity platform) +
 * `DeveloperToken` header on every request.
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

const MS_AUTH       = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MS_TOKEN      = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const MS_ADS_API    = "https://ads.microsoft.com/api/v1"; // REST surface
const MS_CUSTOMER   = "https://clientcenter.api.bingads.microsoft.com/CustomerManagement/v13"; // mgmt SOAP/REST hybrid

const MS_SCOPES = "https://ads.microsoft.com/msads.manage offline_access";

const MS_STATUS: Record<ResourceStatus, string> = {
  draft:     "Paused",
  active:    "Active",
  paused:    "Paused",
  archived:  "Deleted",
  completed: "Deleted",
  error:     "Paused",
};

function msHeaders(accessToken: string, developerToken: string, customerId?: string, accountId?: string): HeadersInit {
  const h: Record<string, string> = {
    Authorization:    `Bearer ${accessToken}`,
    DeveloperToken:   developerToken,
    "Content-Type":   "application/json",
  };
  if (customerId) h.CustomerId = customerId;
  if (accountId)  h.CustomerAccountId = accountId;
  return h;
}

function assertConfigured(config: AdapterConfig): asserts config is AdapterConfig & {
  clientId: string; clientSecret: string; developerToken: string;
} {
  if (!config.clientId || !config.clientSecret) {
    throw new PaidMediaAdapterError("bing", "NOT_CONFIGURED", "Missing MICROSOFT_ADS_CLIENT_ID/SECRET");
  }
  if (!config.developerToken) {
    throw new PaidMediaAdapterError("bing", "NOT_CONFIGURED", "Missing MICROSOFT_ADS_DEVELOPER_TOKEN");
  }
}

export function createBingAdapter(config: AdapterConfig): PaidMediaAdapter {
  return {
    platform: "bing",
    config,

    capabilities(): AdapterCapabilities {
      return {
        targeting: ["geo", "demographics", "devicePlatforms", "operatingSystems", "customAudienceIds"],
        objectives: ["TRAFFIC", "LEAD_GENERATION", "CONVERSIONS"],
        supportsConversions: true,
        supportsReporting: true,
        supportsAudienceSync: true,
        docsUrl: "https://learn.microsoft.com/en-us/advertising/guides/",
      };
    },

    isConfigured() {
      return Boolean(config.clientId && config.clientSecret && config.developerToken);
    },

    buildAuthUrl(opts: OAuthAuthUrlOptions): string {
      if (!config.clientId) throw new PaidMediaAdapterError("bing", "NOT_CONFIGURED", "Missing MICROSOFT_ADS_CLIENT_ID");
      const params = new URLSearchParams({
        client_id:     config.clientId,
        response_type: "code",
        redirect_uri:  opts.redirectUri,
        state:         opts.state,
        scope:         (opts.scopes ?? [MS_SCOPES]).join(" "),
        response_mode: "query",
      });
      return `${MS_AUTH}?${params.toString()}`;
    },

    async exchangeAuthCode(code: string, redirectUri: string): Promise<OAuthTokenSet> {
      assertConfigured(config);
      const res = await adapterFetch("bing", MS_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id:     config.clientId,
          client_secret: config.clientSecret,
          code,
          redirect_uri:  redirectUri,
          grant_type:    "authorization_code",
          scope:         MS_SCOPES,
        }).toString(),
      });
      const t = await res.json() as { access_token: string; refresh_token?: string; expires_in: number; scope?: string };
      return {
        accessToken:  t.access_token,
        refreshToken: t.refresh_token ?? null,
        expiresAt:    new Date(Date.now() + (t.expires_in - 30) * 1000),
        scopes:       t.scope ?? MS_SCOPES,
      };
    },

    async refreshAccessToken(refreshToken: string): Promise<OAuthTokenSet> {
      assertConfigured(config);
      const res = await adapterFetch("bing", MS_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id:     config.clientId,
          client_secret: config.clientSecret,
          refresh_token: refreshToken,
          grant_type:    "refresh_token",
          scope:         MS_SCOPES,
        }).toString(),
      });
      const t = await res.json() as { access_token: string; refresh_token?: string; expires_in: number };
      return {
        accessToken:  t.access_token,
        refreshToken: t.refresh_token ?? refreshToken,
        expiresAt:    new Date(Date.now() + (t.expires_in - 30) * 1000),
        scopes:       MS_SCOPES,
      };
    },

    async listAdAccounts(accessToken: string): Promise<ListedAdAccount[]> {
      assertConfigured(config);
      // The REST surface for Customer Management is being phased in.
      // We use the documented /Accounts/Search route.
      const res = await adapterFetch("bing", `${MS_CUSTOMER}/Accounts/Search`, {
        method: "POST",
        headers: msHeaders(accessToken, config.developerToken),
        body: JSON.stringify({ Predicates: [{ Field: "UserId", Operator: "Equals", Value: "self" }] }),
      });
      const data = await res.json() as { Accounts?: Array<any> };
      return (data.Accounts ?? []).map((a) => ({
        externalAccountId: String(a.Id),
        name:              a.Name ?? `Account ${a.Id}`,
        currencyCode:      a.CurrencyCode,
        timeZone:          a.TimeZone,
        metadata:          { customerId: a.ParentCustomerId, status: a.AccountLifeCycleStatus },
      }));
    },

    async createCampaign(ctx: AdapterContext, input: AdapterCampaignInput): Promise<AdapterResourceRef> {
      assertConfigured(config);
      const res = await adapterFetch("bing", `${MS_ADS_API}/campaigns`, {
        method: "POST",
        headers: msHeaders(ctx.accessToken, config.developerToken, undefined, ctx.externalAccountId),
        body: JSON.stringify({
          Campaign: {
            Name:           input.name,
            CampaignType:   "Search",
            Status:         MS_STATUS[input.status],
            BudgetType:     input.dailyBudgetCents != null ? "DailyBudgetStandard" : "MonthlyBudget",
            DailyBudget:    input.dailyBudgetCents != null ? input.dailyBudgetCents / 100 : undefined,
            MonthlyBudget:  input.dailyBudgetCents == null && input.budgetCents != null ? input.budgetCents / 100 : undefined,
            TimeZone:       "PacificTimeUSCanadaTijuana",
          },
        }),
      });
      const data = await res.json() as { Id?: number };
      if (!data.Id) throw new PaidMediaAdapterError("bing", "API_ERROR", "Failed to create Bing campaign");
      return { externalId: String(data.Id), externalUrl: `https://ui.ads.microsoft.com/campaign/vnext/campaigns?aid=${ctx.externalAccountId}` };
    },

    async updateCampaign(ctx: AdapterContext, externalId: string, input: Partial<AdapterCampaignInput>): Promise<AdapterResourceRef> {
      assertConfigured(config);
      const body: Record<string, unknown> = { Id: Number(externalId) };
      if (input.name)   body.Name = input.name;
      if (input.status) body.Status = MS_STATUS[input.status];
      if (input.dailyBudgetCents != null) body.DailyBudget = input.dailyBudgetCents / 100;
      await adapterFetch("bing", `${MS_ADS_API}/campaigns`, {
        method: "PUT",
        headers: msHeaders(ctx.accessToken, config.developerToken, undefined, ctx.externalAccountId),
        body: JSON.stringify({ Campaigns: [body] }),
      });
      return { externalId };
    },

    async deleteCampaign(ctx: AdapterContext, externalId: string): Promise<void> {
      assertConfigured(config);
      await adapterFetch("bing", `${MS_ADS_API}/campaigns?CampaignIds=${externalId}`, {
        method: "DELETE",
        headers: msHeaders(ctx.accessToken, config.developerToken, undefined, ctx.externalAccountId),
      });
    },

    async createAdSet(ctx: AdapterContext, input: AdapterAdSetInput): Promise<AdapterResourceRef> {
      assertConfigured(config);
      const res = await adapterFetch("bing", `${MS_ADS_API}/adGroups`, {
        method: "POST",
        headers: msHeaders(ctx.accessToken, config.developerToken, undefined, ctx.externalAccountId),
        body: JSON.stringify({
          CampaignId: Number(input.externalCampaignId),
          AdGroup: {
            Name:     input.name,
            Status:   MS_STATUS[input.status],
            StartDate: input.startAt ? { Day: input.startAt.getUTCDate(), Month: input.startAt.getUTCMonth() + 1, Year: input.startAt.getUTCFullYear() } : undefined,
            EndDate:   input.endAt   ? { Day: input.endAt.getUTCDate(),   Month: input.endAt.getUTCMonth() + 1,   Year: input.endAt.getUTCFullYear() } : undefined,
            CpcBid:    input.bidAmountCents != null ? { Amount: input.bidAmountCents / 100 } : undefined,
          },
        }),
      });
      const data = await res.json() as { Id?: number };
      if (!data.Id) throw new PaidMediaAdapterError("bing", "API_ERROR", "Failed to create Bing ad group");
      // TODO: geo/demographic/device criteria via /campaignCriterions + /adGroupCriterions endpoints.
      // Tracked in Consolidated Gap Register under #PM-B1.
      return { externalId: String(data.Id) };
    },

    async updateAdSet(ctx: AdapterContext, externalId: string, input: Partial<AdapterAdSetInput>): Promise<AdapterResourceRef> {
      assertConfigured(config);
      const body: Record<string, unknown> = { Id: Number(externalId) };
      if (input.name)   body.Name = input.name;
      if (input.status) body.Status = MS_STATUS[input.status];
      if (input.bidAmountCents != null) body.CpcBid = { Amount: input.bidAmountCents / 100 };
      await adapterFetch("bing", `${MS_ADS_API}/adGroups`, {
        method: "PUT",
        headers: msHeaders(ctx.accessToken, config.developerToken, undefined, ctx.externalAccountId),
        body: JSON.stringify({ AdGroups: [body] }),
      });
      return { externalId };
    },

    async deleteAdSet(ctx: AdapterContext, externalId: string): Promise<void> {
      assertConfigured(config);
      await adapterFetch("bing", `${MS_ADS_API}/adGroups?AdGroupIds=${externalId}`, {
        method: "DELETE",
        headers: msHeaders(ctx.accessToken, config.developerToken, undefined, ctx.externalAccountId),
      });
    },

    async createCreative(ctx: AdapterContext, input: AdapterCreativeInput): Promise<AdapterResourceRef> {
      // Like Google: creative attaches to the ad. Return synthetic id.
      return { externalId: `synthetic:${input.internalId}` };
    },

    async createAd(ctx: AdapterContext, input: AdapterAdInput): Promise<AdapterResourceRef> {
      assertConfigured(config);
      const headlines    = ((input as any).headlines    ?? [(input as any).headline    ?? "Visit Site"]) as string[];
      const descriptions = ((input as any).descriptions ?? [(input as any).description ?? "Learn more today"]) as string[];
      const res = await adapterFetch("bing", `${MS_ADS_API}/ads`, {
        method: "POST",
        headers: msHeaders(ctx.accessToken, config.developerToken, undefined, ctx.externalAccountId),
        body: JSON.stringify({
          AdGroupId: Number(input.externalAdSetId),
          Ad: {
            Type:           "ResponsiveSearch",
            Status:         MS_STATUS[input.status],
            Headlines:      headlines.slice(0, 15).map((Text) => ({ Text })),
            Descriptions:   descriptions.slice(0, 4).map((Text) => ({ Text })),
            FinalUrls:      [input.destinationUrl],
            UrlCustomParameters: {
              Parameters: [
                { Key: "utm_source",   Value: input.utmSource   ?? "bing" },
                { Key: "utm_medium",   Value: input.utmMedium   ?? "cpc" },
                { Key: "utm_campaign", Value: input.utmCampaign ?? input.name },
              ].filter((p) => p.Value),
            },
          },
        }),
      });
      const data = await res.json() as { Id?: number };
      if (!data.Id) throw new PaidMediaAdapterError("bing", "API_ERROR", "Failed to create Bing ad");
      return { externalId: String(data.Id) };
    },

    async updateAd(ctx: AdapterContext, externalId: string, input: Partial<AdapterAdInput>): Promise<AdapterResourceRef> {
      assertConfigured(config);
      const body: Record<string, unknown> = { Id: Number(externalId) };
      if (input.status) body.Status = MS_STATUS[input.status];
      await adapterFetch("bing", `${MS_ADS_API}/ads`, {
        method: "PUT",
        headers: msHeaders(ctx.accessToken, config.developerToken, undefined, ctx.externalAccountId),
        body: JSON.stringify({ Ads: [body] }),
      });
      return { externalId };
    },

    async deleteAd(ctx: AdapterContext, externalId: string): Promise<void> {
      assertConfigured(config);
      await adapterFetch("bing", `${MS_ADS_API}/ads?AdIds=${externalId}`, {
        method: "DELETE",
        headers: msHeaders(ctx.accessToken, config.developerToken, undefined, ctx.externalAccountId),
      });
    },

    async pullInsights(ctx: AdapterContext, query: InsightsQuery): Promise<InsightRow[]> {
      assertConfigured(config);
      // Microsoft Ads reporting goes through the Reporting Service, which
      // returns a download URL. To keep this synchronous in a worker, we
      // use the REST stats endpoint which supports a synchronous fetch
      // for short ranges.
      const reportType = query.resourceKind === "campaign" ? "campaignPerformance" :
                         query.resourceKind === "ad_set"  ? "adGroupPerformance"  : "adPerformance";
      const res = await adapterFetch("bing", `${MS_ADS_API}/reports/${reportType}?startDate=${query.since}&endDate=${query.until}${query.externalIds?.length ? `&ids=${query.externalIds.join(",")}` : ""}`, {
        method: "GET",
        headers: msHeaders(ctx.accessToken, config.developerToken, undefined, ctx.externalAccountId),
      });
      const data = await res.json() as { rows?: Array<any> };
      return (data.rows ?? []).map((r) => ({
        externalId:  String(r.id ?? r.campaignId ?? r.adGroupId ?? r.adId ?? ""),
        resourceKind: query.resourceKind,
        date:        r.date ?? query.since,
        impressions: Number(r.impressions ?? 0),
        clicks:      Number(r.clicks ?? 0),
        spendCents:  Math.round(Number(r.spend ?? 0) * 100),
        conversions: Number(r.conversions ?? 0),
        videoViews:  0,
        rawMetrics:  r,
      }));
    },
  };
}
