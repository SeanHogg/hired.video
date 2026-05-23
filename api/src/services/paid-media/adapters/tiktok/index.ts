/**
 * TikTok for Business (Marketing API) adapter.
 *
 * API reference:
 *   https://business-api.tiktok.com/portal/docs
 *
 * Hierarchy: Campaign → Ad Group (= our ad_set) → Ad → Identity/Creative.
 * Access token is passed via `Access-Token` header (not Authorization).
 *
 * Pinned API version: v1.3
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
  TargetingSpec,
} from "../../ports/types.js";

const TT_API = "https://business-api.tiktok.com/open_api/v1.3";
const TT_AUTH = "https://business-api.tiktok.com/portal/auth";
const TT_TOKEN = `${TT_API}/oauth2/access_token/`;

const TT_STATUS_ON: Record<ResourceStatus, string> = {
  draft:     "DISABLE",
  active:    "ENABLE",
  paused:    "DISABLE",
  archived:  "DELETE",
  completed: "DELETE",
  error:     "DISABLE",
};

const TT_OBJECTIVE: Record<string, string> = {
  AWARENESS:        "REACH",
  TRAFFIC:          "TRAFFIC",
  LEAD_GENERATION:  "LEAD_GENERATION",
  CONVERSIONS:      "WEB_CONVERSIONS",
  VIDEO_VIEWS:      "VIDEO_VIEW",
  APP_INSTALLS:     "APP_PROMOTION",
  JOB_APPLICATIONS: "LEAD_GENERATION",
};

function ttHeaders(accessToken: string): HeadersInit {
  return {
    "Access-Token":  accessToken,
    "Content-Type":  "application/json",
  };
}

function ttTargeting(spec: TargetingSpec): Record<string, unknown> {
  const t: Record<string, unknown> = {};
  if (spec.geo?.countries?.length) t.location_ids = spec.geo.countries;
  if (spec.demographics?.ageMin || spec.demographics?.ageMax) {
    t.age_groups = ["AGE_18_24", "AGE_25_34", "AGE_35_44", "AGE_45_54", "AGE_55_100"].filter((g) => {
      const [, lo, hi] = g.match(/AGE_(\d+)_(\d+)/) ?? [];
      const min = spec.demographics?.ageMin ?? 0;
      const max = spec.demographics?.ageMax ?? 999;
      return Number(lo) <= max && Number(hi) >= min;
    });
  }
  if (spec.demographics?.genders?.length) {
    const g = spec.demographics.genders[0];
    t.gender = g === "male" ? "GENDER_MALE" : g === "female" ? "GENDER_FEMALE" : "GENDER_UNLIMITED";
  }
  if (spec.demographics?.languages?.length) t.languages = spec.demographics.languages;
  if (spec.interests?.length) t.interest_keyword_ids = spec.interests;
  if (spec.devicePlatforms?.length) t.device_model_ids = []; // platform-specific
  if (spec.operatingSystems?.length) t.operation_system = spec.operatingSystems.map((o) => o.toUpperCase());
  if (spec.placements?.length) {
    t.placements = spec.placements.filter((p) => p === "feed" || p === "shorts").map(() => "PLACEMENT_TIKTOK");
  }
  return t;
}

async function ttGet(url: string, accessToken: string): Promise<any> {
  const res = await adapterFetch("tiktok", url, { method: "GET", headers: ttHeaders(accessToken) });
  return res.json();
}

async function ttPost(url: string, accessToken: string, body: unknown): Promise<any> {
  const res = await adapterFetch("tiktok", url, { method: "POST", headers: ttHeaders(accessToken), body: JSON.stringify(body) });
  return res.json();
}

export function createTikTokAdapter(config: AdapterConfig): PaidMediaAdapter {
  return {
    platform: "tiktok",
    config,

    capabilities(): AdapterCapabilities {
      return {
        targeting: ["geo", "demographics", "interests", "operatingSystems", "placements", "customAudienceIds", "excludeAudienceIds"],
        objectives: ["AWARENESS", "TRAFFIC", "LEAD_GENERATION", "CONVERSIONS", "VIDEO_VIEWS", "APP_INSTALLS"],
        supportsConversions: true,
        supportsReporting: true,
        supportsAudienceSync: true,
        docsUrl: "https://business-api.tiktok.com/portal/docs",
      };
    },

    isConfigured() {
      return Boolean(config.clientId && config.clientSecret);
    },

    buildAuthUrl(opts: OAuthAuthUrlOptions): string {
      if (!config.appId) throw new PaidMediaAdapterError("tiktok", "NOT_CONFIGURED", "Missing TIKTOK_APP_ID");
      const params = new URLSearchParams({
        app_id:       config.appId,
        redirect_uri: opts.redirectUri,
        state:        opts.state,
      });
      return `${TT_AUTH}?${params.toString()}`;
    },

    async exchangeAuthCode(code: string, _redirectUri: string): Promise<OAuthTokenSet> {
      if (!config.appId || !config.clientSecret) {
        throw new PaidMediaAdapterError("tiktok", "NOT_CONFIGURED", "Missing TikTok credentials");
      }
      const data = await ttPost(TT_TOKEN, "", {
        app_id:    config.appId,
        secret:    config.clientSecret,
        auth_code: code,
      });
      if (data.code !== 0) {
        throw new PaidMediaAdapterError("tiktok", "OAUTH_FAILED", data.message ?? "Token exchange failed");
      }
      return {
        accessToken:  data.data.access_token,
        refreshToken: data.data.refresh_token ?? null,
        expiresAt:    data.data.access_token_expire_in
          ? new Date(Date.now() + data.data.access_token_expire_in * 1000)
          : null,
        scopes:       (data.data.scope ?? []).join(","),
      };
    },

    async refreshAccessToken(refreshToken: string): Promise<OAuthTokenSet> {
      // TikTok long-lived access tokens; refresh uses /oauth2/refresh_token/
      if (!config.appId || !config.clientSecret) {
        throw new PaidMediaAdapterError("tiktok", "NOT_CONFIGURED", "Missing TikTok credentials");
      }
      const data = await ttPost(`${TT_API}/oauth2/refresh_token/`, "", {
        app_id:        config.appId,
        secret:        config.clientSecret,
        refresh_token: refreshToken,
      });
      if (data.code !== 0) {
        throw new PaidMediaAdapterError("tiktok", "OAUTH_FAILED", data.message ?? "Refresh failed");
      }
      return {
        accessToken:  data.data.access_token,
        refreshToken: data.data.refresh_token ?? refreshToken,
        expiresAt:    data.data.access_token_expire_in
          ? new Date(Date.now() + data.data.access_token_expire_in * 1000)
          : null,
        scopes:       "",
      };
    },

    async listAdAccounts(accessToken: string): Promise<ListedAdAccount[]> {
      if (!config.appId || !config.clientSecret) {
        throw new PaidMediaAdapterError("tiktok", "NOT_CONFIGURED", "Missing TikTok credentials");
      }
      const data = await ttGet(`${TT_API}/oauth2/advertiser/get/?app_id=${encodeURIComponent(config.appId)}&secret=${encodeURIComponent(config.clientSecret)}`, accessToken);
      const advertisers = data.data?.list ?? [];
      return advertisers.map((a: any) => ({
        externalAccountId: String(a.advertiser_id),
        name:              a.advertiser_name ?? `Advertiser ${a.advertiser_id}`,
      }));
    },

    async createCampaign(ctx: AdapterContext, input: AdapterCampaignInput): Promise<AdapterResourceRef> {
      const data = await ttPost(`${TT_API}/campaign/create/`, ctx.accessToken, {
        advertiser_id:    ctx.externalAccountId,
        campaign_name:    input.name,
        objective_type:   TT_OBJECTIVE[input.objective] ?? "TRAFFIC",
        budget_mode:      input.budgetCents != null ? "BUDGET_MODE_TOTAL" : "BUDGET_MODE_INFINITE",
        ...(input.budgetCents != null ? { budget: input.budgetCents / 100 } : {}),
      });
      if (data.code !== 0) throw new PaidMediaAdapterError("tiktok", "API_ERROR", data.message);
      const id = String(data.data.campaign_id);
      return { externalId: id, externalUrl: `https://ads.tiktok.com/i18n/perf/campaign?aadvid=${ctx.externalAccountId}` };
    },

    async updateCampaign(ctx: AdapterContext, externalId: string, input: Partial<AdapterCampaignInput>): Promise<AdapterResourceRef> {
      const body: Record<string, unknown> = {
        advertiser_id: ctx.externalAccountId,
        campaign_id:   externalId,
      };
      if (input.name) body.campaign_name = input.name;
      const data = await ttPost(`${TT_API}/campaign/update/`, ctx.accessToken, body);
      if (data.code !== 0) throw new PaidMediaAdapterError("tiktok", "API_ERROR", data.message);

      if (input.status) {
        await ttPost(`${TT_API}/campaign/status/update/`, ctx.accessToken, {
          advertiser_id: ctx.externalAccountId,
          campaign_ids: [externalId],
          operation_status: TT_STATUS_ON[input.status],
        });
      }
      return { externalId };
    },

    async deleteCampaign(ctx: AdapterContext, externalId: string): Promise<void> {
      await ttPost(`${TT_API}/campaign/status/update/`, ctx.accessToken, {
        advertiser_id: ctx.externalAccountId,
        campaign_ids: [externalId],
        operation_status: "DELETE",
      });
    },

    async createAdSet(ctx: AdapterContext, input: AdapterAdSetInput): Promise<AdapterResourceRef> {
      const data = await ttPost(`${TT_API}/adgroup/create/`, ctx.accessToken, {
        advertiser_id:    ctx.externalAccountId,
        campaign_id:      input.externalCampaignId,
        adgroup_name:     input.name,
        budget_mode:      input.dailyBudgetCents != null ? "BUDGET_MODE_DAY" : "BUDGET_MODE_TOTAL",
        ...(input.dailyBudgetCents != null    ? { budget: input.dailyBudgetCents / 100 } : {}),
        ...(input.lifetimeBudgetCents != null ? { budget: input.lifetimeBudgetCents / 100 } : {}),
        billing_event:    input.optimizationGoal === "CLICK" ? "CPC" : "CPM",
        optimization_goal: input.optimizationGoal === "CONVERSION" ? "CONVERSION" : "CLICK",
        bid_type:         input.bidStrategy === "AUTO" ? "BID_TYPE_NO_BID" : "BID_TYPE_CUSTOM",
        ...(input.bidAmountCents ? { bid_price: input.bidAmountCents / 100 } : {}),
        ...(input.startAt ? { schedule_start_time: Math.floor(input.startAt.getTime() / 1000) } : {}),
        ...(input.endAt   ? { schedule_end_time:   Math.floor(input.endAt.getTime() / 1000) } : {}),
        ...ttTargeting(input.targeting),
        ...(input.frequencyCapImpressions && input.frequencyCapHours
          ? { frequency: input.frequencyCapImpressions, frequency_schedule: input.frequencyCapHours }
          : {}),
      });
      if (data.code !== 0) throw new PaidMediaAdapterError("tiktok", "API_ERROR", data.message);
      return { externalId: String(data.data.adgroup_id) };
    },

    async updateAdSet(ctx: AdapterContext, externalId: string, input: Partial<AdapterAdSetInput>): Promise<AdapterResourceRef> {
      const body: Record<string, unknown> = {
        advertiser_id: ctx.externalAccountId,
        adgroup_id:    externalId,
      };
      if (input.name) body.adgroup_name = input.name;
      const data = await ttPost(`${TT_API}/adgroup/update/`, ctx.accessToken, body);
      if (data.code !== 0) throw new PaidMediaAdapterError("tiktok", "API_ERROR", data.message);
      if (input.status) {
        await ttPost(`${TT_API}/adgroup/status/update/`, ctx.accessToken, {
          advertiser_id: ctx.externalAccountId,
          adgroup_ids: [externalId],
          operation_status: TT_STATUS_ON[input.status],
        });
      }
      return { externalId };
    },

    async deleteAdSet(ctx: AdapterContext, externalId: string): Promise<void> {
      await ttPost(`${TT_API}/adgroup/status/update/`, ctx.accessToken, {
        advertiser_id: ctx.externalAccountId,
        adgroup_ids: [externalId],
        operation_status: "DELETE",
      });
    },

    async createCreative(ctx: AdapterContext, input: AdapterCreativeInput): Promise<AdapterResourceRef> {
      // TikTok creatives are inline on the ad — we return a synthetic
      // id; createAd() uses the data carried in service layer.
      return { externalId: `synthetic:${input.internalId}` };
    },

    async createAd(ctx: AdapterContext, input: AdapterAdInput): Promise<AdapterResourceRef> {
      const videoId = (input as any).metadata?.tiktokVideoId;
      const identityId = (input as any).metadata?.tiktokIdentityId;
      if (!videoId || !identityId) {
        throw new PaidMediaAdapterError("tiktok", "VALIDATION_ERROR", "TikTok ad requires metadata.tiktokVideoId and metadata.tiktokIdentityId (upload via /file/video/ad/upload/ first)");
      }
      const data = await ttPost(`${TT_API}/ad/create/`, ctx.accessToken, {
        advertiser_id: ctx.externalAccountId,
        adgroup_id:    input.externalAdSetId,
        creatives: [{
          ad_name:           input.name,
          identity_id:       identityId,
          identity_type:     "CUSTOMIZED_USER",
          ad_format:         "SINGLE_VIDEO",
          video_id:          videoId,
          ad_text:           (input as any).primaryText ?? "",
          call_to_action:    (input as any).ctaText ?? "LEARN_MORE",
          landing_page_url:  input.destinationUrl,
        }],
      });
      if (data.code !== 0) throw new PaidMediaAdapterError("tiktok", "API_ERROR", data.message);
      const adId = data.data?.ad_ids?.[0] ?? data.data?.creatives?.[0]?.ad_id;
      return { externalId: String(adId) };
    },

    async updateAd(ctx: AdapterContext, externalId: string, input: Partial<AdapterAdInput>): Promise<AdapterResourceRef> {
      if (input.status) {
        await ttPost(`${TT_API}/ad/status/update/`, ctx.accessToken, {
          advertiser_id: ctx.externalAccountId,
          ad_ids: [externalId],
          operation_status: TT_STATUS_ON[input.status],
        });
      }
      return { externalId };
    },

    async deleteAd(ctx: AdapterContext, externalId: string): Promise<void> {
      await ttPost(`${TT_API}/ad/status/update/`, ctx.accessToken, {
        advertiser_id: ctx.externalAccountId,
        ad_ids: [externalId],
        operation_status: "DELETE",
      });
    },

    async pullInsights(ctx: AdapterContext, query: InsightsQuery): Promise<InsightRow[]> {
      const dataLevel = query.resourceKind === "campaign" ? "AUCTION_CAMPAIGN" : query.resourceKind === "ad_set" ? "AUCTION_ADGROUP" : "AUCTION_AD";
      const params = new URLSearchParams({
        advertiser_id: ctx.externalAccountId,
        report_type:   "BASIC",
        data_level:    dataLevel,
        dimensions:    JSON.stringify([query.resourceKind === "campaign" ? "campaign_id" : query.resourceKind === "ad_set" ? "adgroup_id" : "ad_id", "stat_time_day"]),
        metrics:       JSON.stringify(["impressions", "clicks", "spend", "conversion", "video_play_actions"]),
        start_date:    query.since,
        end_date:      query.until,
      });
      const data = await ttGet(`${TT_API}/report/integrated/get/?${params.toString()}`, ctx.accessToken);
      const list = data.data?.list ?? [];
      return list.map((r: any) => ({
        externalId:  String(r.dimensions?.campaign_id ?? r.dimensions?.adgroup_id ?? r.dimensions?.ad_id ?? ""),
        resourceKind: query.resourceKind,
        date:        r.dimensions?.stat_time_day ?? query.since,
        impressions: Number(r.metrics?.impressions ?? 0),
        clicks:      Number(r.metrics?.clicks ?? 0),
        spendCents:  Math.round(Number(r.metrics?.spend ?? 0) * 100),
        conversions: Number(r.metrics?.conversion ?? 0),
        videoViews:  Number(r.metrics?.video_play_actions ?? 0),
        rawMetrics:  r,
      }));
    },
  };
}
