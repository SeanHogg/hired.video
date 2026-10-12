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
 *
 * Modules: http.ts (transport), oauth.ts (OAuth + accounts), insights.ts
 * (reporting), criteria.ts / apply-criteria.ts (targeting, #976).
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
} from "../../ports/types.js";
import { applyGoogleTargetingCriteria } from "./apply-criteria.js";
import { GOOGLE_ADS_API, G_CHANNEL, G_STATUS, assertConfigured, customerPost, gAuthHeaders } from "./http.js";
import { createGoogleOAuth } from "./oauth.js";
import { createGoogleInsights } from "./insights.js";

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

    ...createGoogleOAuth(config),

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
      // #976 — geo / language / device / age / gender in ONE mutate batch.
      const criteria = await applyGoogleTargetingCriteria(customerPost(ctx, config.developerToken), {
        customerId: ctx.externalAccountId,
        campaignId: input.externalCampaignId,
        adGroupId: id,
        spec: input.targeting ?? {},
        readExisting: false,
      });
      return { externalId: id, raw: { adGroup: data, criteria } };
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
      const adGroup = await res.json();
      // #976 — re-sync targeting as a delta against what Google already has.
      const criteria = input.targeting && input.externalCampaignId
        ? await applyGoogleTargetingCriteria(customerPost(ctx, config.developerToken), {
            customerId: ctx.externalAccountId,
            campaignId: input.externalCampaignId,
            adGroupId: externalId,
            spec: input.targeting,
            readExisting: true,
          })
        : null;
      return { externalId, raw: criteria ? { adGroup, criteria } : adGroup };
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

    ...createGoogleInsights(config),
  };
}
