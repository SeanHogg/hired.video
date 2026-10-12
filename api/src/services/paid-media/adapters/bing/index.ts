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
  InsightsQuery,
  InsightsResult,
  ListedAdAccount,
  OAuthAuthUrlOptions,
  OAuthTokenSet,
  ResourceStatus,
} from "../../ports/types.js";
import { MS_CAMPAIGN_API } from "./criteria.js";
import { createBingAdGroup, deleteBingAdGroup, updateBingAdGroup, type BingCall } from "./ad-groups.js";
import { createBingAd, deleteBingAd, updateBingAd } from "./ads.js";
import { MS_REPORTING_API, pullBingInsights } from "./reporting.js";

const MS_AUTH       = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MS_TOKEN      = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
// Every call goes to the documented v13 services: Campaign Management
// (MS_CAMPAIGN_API — campaigns, ad groups, criteria, ads) and Reporting
// (MS_REPORTING_API).
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

/** Campaign Management v13 JSON call with the adapter's auth + error mapping. */
function campaignCall(ctx: AdapterContext, developerToken: string): BingCall {
  return async (method, path, body) => {
    const res = await adapterFetch("bing", `${MS_CAMPAIGN_API}${path}`, {
      method,
      headers: msHeaders(ctx.accessToken, developerToken, undefined, ctx.externalAccountId),
      body: JSON.stringify(body),
    });
    return res.json();
  };
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
      // v13 AddCampaigns: POST /Campaigns → { CampaignIds, PartialErrors }.
      const data = await campaignCall(ctx, config.developerToken)("POST", "/Campaigns", {
        AccountId: Number(ctx.externalAccountId),
        Campaigns: [{
          Name:          input.name,
          CampaignType:  "Search",
          Status:        MS_STATUS[input.status],
          BudgetType:    input.dailyBudgetCents != null ? "DailyBudgetStandard" : "MonthlyBudget",
          DailyBudget:   input.dailyBudgetCents != null ? input.dailyBudgetCents / 100 : undefined,
          MonthlyBudget: input.dailyBudgetCents == null && input.budgetCents != null ? input.budgetCents / 100 : undefined,
          TimeZone:      "PacificTimeUSCanadaTijuana",
        }],
      });
      const id = data?.CampaignIds?.[0];
      if (id == null) throw new PaidMediaAdapterError("bing", "API_ERROR", "Failed to create Bing campaign", data?.PartialErrors);
      return { externalId: String(id), externalUrl: `https://ui.ads.microsoft.com/campaign/vnext/campaigns?aid=${ctx.externalAccountId}`, raw: data };
    },

    async updateCampaign(ctx: AdapterContext, externalId: string, input: Partial<AdapterCampaignInput>): Promise<AdapterResourceRef> {
      assertConfigured(config);
      const body: Record<string, unknown> = { Id: Number(externalId) };
      if (input.name)   body.Name = input.name;
      if (input.status) body.Status = MS_STATUS[input.status];
      if (input.dailyBudgetCents != null) body.DailyBudget = input.dailyBudgetCents / 100;
      const raw = await campaignCall(ctx, config.developerToken)("PUT", "/Campaigns", {
        AccountId: Number(ctx.externalAccountId),
        Campaigns: [body],
      });
      return { externalId, raw };
    },

    async deleteCampaign(ctx: AdapterContext, externalId: string): Promise<void> {
      assertConfigured(config);
      await campaignCall(ctx, config.developerToken)("DELETE", "/Campaigns", {
        AccountId: Number(ctx.externalAccountId),
        CampaignIds: [Number(externalId)],
      });
    },

    async createAdSet(ctx: AdapterContext, input: AdapterAdSetInput): Promise<AdapterResourceRef> {
      assertConfigured(config);
      return createBingAdGroup(campaignCall(ctx, config.developerToken), input, MS_STATUS[input.status]);
    },

    async updateAdSet(ctx: AdapterContext, externalId: string, input: Partial<AdapterAdSetInput>): Promise<AdapterResourceRef> {
      assertConfigured(config);
      return updateBingAdGroup(
        campaignCall(ctx, config.developerToken),
        externalId,
        input,
        input.status ? MS_STATUS[input.status] : undefined,
      );
    },

    async deleteAdSet(ctx: AdapterContext, externalId: string, parent?: { externalCampaignId: string }): Promise<void> {
      assertConfigured(config);
      await deleteBingAdGroup(campaignCall(ctx, config.developerToken), externalId, parent?.externalCampaignId);
    },

    async createCreative(ctx: AdapterContext, input: AdapterCreativeInput): Promise<AdapterResourceRef> {
      // Like Google: creative attaches to the ad. Return synthetic id.
      return { externalId: `synthetic:${input.internalId}` };
    },

    async createAd(ctx: AdapterContext, input: AdapterAdInput): Promise<AdapterResourceRef> {
      assertConfigured(config);
      return createBingAd(campaignCall(ctx, config.developerToken), input, MS_STATUS[input.status]);
    },

    async updateAd(ctx: AdapterContext, externalId: string, input: Partial<AdapterAdInput>): Promise<AdapterResourceRef> {
      assertConfigured(config);
      return updateBingAd(campaignCall(ctx, config.developerToken), externalId, input, input.status ? MS_STATUS[input.status] : undefined);
    },

    async deleteAd(ctx: AdapterContext, externalId: string, parent?: { externalAdSetId: string }): Promise<void> {
      assertConfigured(config);
      await deleteBingAd(campaignCall(ctx, config.developerToken), externalId, parent?.externalAdSetId);
    },

    async pullInsights(ctx: AdapterContext, query: InsightsQuery): Promise<InsightsResult> {
      assertConfigured(config);
      const headers = msHeaders(ctx.accessToken, config.developerToken, undefined, ctx.externalAccountId);
      return pullBingInsights(
        async (path, body) => {
          const res = await adapterFetch("bing", `${MS_REPORTING_API}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
          return res.json();
        },
        async (url) => (await adapterFetch("bing", url, { method: "GET" })).arrayBuffer(),
        ctx.externalAccountId,
        query,
      );
    },
  };
}
