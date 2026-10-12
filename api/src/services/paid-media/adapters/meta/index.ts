/**
 * Meta Marketing API adapter (Facebook + Instagram).
 *
 * API reference:
 *   https://developers.facebook.com/docs/marketing-apis
 *   https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group/
 *   https://developers.facebook.com/docs/marketing-api/insights
 *
 * Pinned API version: v19.0 (updated quarterly — bump META_API_VERSION
 * when Meta deprecates).
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

const META_API_VERSION = "v19.0";
const META_GRAPH = `https://graph.facebook.com/${META_API_VERSION}`;
const META_AUTH = "https://www.facebook.com/dialog/oauth";
const META_TOKEN = `${META_GRAPH}/oauth/access_token`;

const META_SCOPES = [
  "ads_management",
  "ads_read",
  "business_management",
  "pages_show_list",
  "pages_read_engagement",
  "instagram_basic",
].join(",");

/** Meta-native status values. */
const META_STATUS: Record<ResourceStatus, string> = {
  draft:     "PAUSED",
  active:    "ACTIVE",
  paused:    "PAUSED",
  archived:  "ARCHIVED",
  completed: "ARCHIVED",
  error:     "PAUSED",
};

/** Meta-native objective mapping. */
const META_OBJECTIVE: Record<string, string> = {
  AWARENESS:        "OUTCOME_AWARENESS",
  TRAFFIC:          "OUTCOME_TRAFFIC",
  LEAD_GENERATION:  "OUTCOME_LEADS",
  CONVERSIONS:      "OUTCOME_SALES",
  VIDEO_VIEWS:      "OUTCOME_AWARENESS",
  APP_INSTALLS:     "OUTCOME_APP_PROMOTION",
  JOB_APPLICATIONS: "OUTCOME_LEADS",
};

const META_CTA_TEXT: Record<string, string> = {
  APPLY_NOW:        "APPLY_NOW",
  LEARN_MORE:       "LEARN_MORE",
  SIGN_UP:          "SIGN_UP",
  GET_OFFER:        "GET_OFFER",
  GET_QUOTE:        "GET_QUOTE",
  CONTACT_US:       "CONTACT_US",
  DOWNLOAD:         "DOWNLOAD",
  WATCH_MORE:       "WATCH_MORE",
  BOOK_TRAVEL:      "BOOK_TRAVEL",
};

function metaStatus(s: ResourceStatus): string {
  return META_STATUS[s];
}
function metaObjective(o: string): string {
  return META_OBJECTIVE[o] ?? "OUTCOME_TRAFFIC";
}
function metaCta(c: string): string {
  return META_CTA_TEXT[c] ?? "LEARN_MORE";
}

/** Translate platform-neutral TargetingSpec to Meta's `targeting` object. */
function metaTargeting(spec: TargetingSpec): Record<string, unknown> {
  const t: Record<string, unknown> = {};
  if (spec.geo?.countries) t.geo_locations = { countries: spec.geo.countries };
  if (spec.demographics?.ageMin) t.age_min = spec.demographics.ageMin;
  if (spec.demographics?.ageMax) t.age_max = spec.demographics.ageMax;
  if (spec.demographics?.genders) {
    // Meta: 1 = male, 2 = female. Empty = all.
    const g = spec.demographics.genders
      .map((x) => (x === "male" ? 1 : x === "female" ? 2 : null))
      .filter((x): x is 1 | 2 => x !== null);
    if (g.length) t.genders = g;
  }
  if (spec.demographics?.languages) t.locales = spec.demographics.languages;
  if (spec.interests?.length) {
    t.interests = spec.interests.map((id) => ({ id }));
  }
  if (spec.behaviors?.length) {
    t.behaviors = spec.behaviors.map((id) => ({ id }));
  }
  if (spec.customAudienceIds?.length) {
    t.custom_audiences = spec.customAudienceIds.map((id) => ({ id }));
  }
  if (spec.excludeAudienceIds?.length) {
    t.excluded_custom_audiences = spec.excludeAudienceIds.map((id) => ({ id }));
  }
  if (spec.placements?.length) {
    // Meta maps placements via publisher_platforms + facebook_positions etc.
    t.publisher_platforms = Array.from(new Set(spec.placements.map((p) => {
      if (p === "feed" || p === "stories" || p === "reels") return "facebook";
      if (p === "audience_network") return "audience_network";
      if (p === "messenger") return "messenger";
      return "facebook";
    })));
  }
  if (spec.devicePlatforms?.length) {
    t.device_platforms = spec.devicePlatforms.filter((d) => d === "mobile" || d === "desktop");
  }
  return t;
}

async function metaGet(url: string, accessToken: string): Promise<any> {
  return (await adapterFetch("meta", `${url}${url.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(accessToken)}`, { method: "GET" })).json();
}

async function metaPost(url: string, accessToken: string, body: Record<string, unknown>): Promise<any> {
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined || v === null) continue;
    form.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  form.set("access_token", accessToken);
  return (await adapterFetch("meta", url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  })).json();
}

async function metaDelete(url: string, accessToken: string): Promise<void> {
  await adapterFetch("meta", `${url}?access_token=${encodeURIComponent(accessToken)}`, { method: "DELETE" });
}

export function createMetaAdapter(config: AdapterConfig): PaidMediaAdapter {
  return {
    platform: "meta",
    config,

    capabilities(): AdapterCapabilities {
      return {
        targeting: [
          "geo", "demographics", "interests", "behaviors",
          "customAudienceIds", "lookalikeAudienceIds", "excludeAudienceIds",
          "placements", "devicePlatforms",
        ],
        objectives: ["AWARENESS", "TRAFFIC", "LEAD_GENERATION", "CONVERSIONS", "VIDEO_VIEWS", "APP_INSTALLS", "JOB_APPLICATIONS"],
        supportsConversions: true,
        supportsReporting: true,
        supportsAudienceSync: true,
        docsUrl: "https://developers.facebook.com/docs/marketing-apis",
      };
    },

    isConfigured() {
      return Boolean(config.clientId && config.clientSecret);
    },

    buildAuthUrl(opts: OAuthAuthUrlOptions): string {
      if (!config.clientId) throw new PaidMediaAdapterError("meta", "NOT_CONFIGURED", "Missing META_APP_ID");
      const params = new URLSearchParams({
        client_id:     config.clientId,
        redirect_uri:  opts.redirectUri,
        state:         opts.state,
        scope:         (opts.scopes ?? [META_SCOPES]).join(","),
        response_type: "code",
      });
      return `${META_AUTH}?${params.toString()}`;
    },

    async exchangeAuthCode(code: string, redirectUri: string): Promise<OAuthTokenSet> {
      if (!config.clientId || !config.clientSecret) {
        throw new PaidMediaAdapterError("meta", "NOT_CONFIGURED", "Missing META client credentials");
      }
      const params = new URLSearchParams({
        client_id:     config.clientId,
        client_secret: config.clientSecret,
        redirect_uri:  redirectUri,
        code,
      });
      const res = await adapterFetch("meta", `${META_TOKEN}?${params.toString()}`, { method: "GET" });
      const data = await res.json() as { access_token: string; expires_in?: number; token_type?: string };

      // Exchange short-lived for long-lived token (60-day) immediately.
      // https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived
      const longUrl = `${META_GRAPH}/oauth/access_token?${new URLSearchParams({
        grant_type:        "fb_exchange_token",
        client_id:         config.clientId,
        client_secret:     config.clientSecret,
        fb_exchange_token: data.access_token,
      }).toString()}`;
      const longRes = await adapterFetch("meta", longUrl, { method: "GET" });
      const long = await longRes.json() as { access_token: string; expires_in?: number };

      // Get user identity for display in UI.
      const meRes = await adapterFetch("meta", `${META_GRAPH}/me?fields=id,name&access_token=${encodeURIComponent(long.access_token)}`, { method: "GET" });
      const me = await meRes.json() as { id: string; name?: string };

      return {
        accessToken:        long.access_token,
        refreshToken:       null, // Meta doesn't issue refresh tokens; long-lived token is renewed by reuse.
        expiresAt:          long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null,
        scopes:             META_SCOPES,
        externalUserId:     me.id,
        externalUserHandle: me.name,
      };
    },

    async refreshAccessToken(refreshToken: string): Promise<OAuthTokenSet> {
      // Meta long-lived tokens don't refresh — caller must prompt user to re-auth.
      throw new PaidMediaAdapterError(
        "meta",
        "OAUTH_FAILED",
        "Meta does not support refresh tokens; user must re-authorize when long-lived token expires.",
      );
    },

    async listAdAccounts(accessToken: string): Promise<ListedAdAccount[]> {
      const res = await metaGet(`${META_GRAPH}/me/adaccounts?fields=id,name,account_id,currency,timezone_name,account_status`, accessToken);
      return ((res.data ?? []) as Array<any>).map((a) => ({
        externalAccountId: a.id, // act_<account_id>
        name:              a.name ?? `Ad Account ${a.account_id}`,
        currencyCode:      a.currency,
        timeZone:          a.timezone_name,
        metadata:          { accountStatus: a.account_status, accountId: a.account_id },
      }));
    },

    async createCampaign(ctx: AdapterContext, input: AdapterCampaignInput): Promise<AdapterResourceRef> {
      const data = await metaPost(`${META_GRAPH}/${ctx.externalAccountId}/campaigns`, ctx.accessToken, {
        name:                  input.name,
        objective:             metaObjective(input.objective),
        status:                metaStatus(input.status),
        special_ad_categories: input.metadata.specialAdCategories ?? ["EMPLOYMENT"],
        ...(input.budgetCents != null      ? { lifetime_budget: input.budgetCents } : {}),
        ...(input.dailyBudgetCents != null ? { daily_budget:    input.dailyBudgetCents } : {}),
      });
      return { externalId: data.id, externalUrl: `https://business.facebook.com/adsmanager/manage/campaigns?selected_campaign_ids=${data.id}`, raw: data };
    },

    async updateCampaign(ctx: AdapterContext, externalId: string, input: Partial<AdapterCampaignInput>): Promise<AdapterResourceRef> {
      const body: Record<string, unknown> = {};
      if (input.name)   body.name   = input.name;
      if (input.status) body.status = metaStatus(input.status);
      if (input.budgetCents != null)      body.lifetime_budget = input.budgetCents;
      if (input.dailyBudgetCents != null) body.daily_budget    = input.dailyBudgetCents;
      const data = await metaPost(`${META_GRAPH}/${externalId}`, ctx.accessToken, body);
      return { externalId, raw: data };
    },

    async deleteCampaign(ctx: AdapterContext, externalId: string): Promise<void> {
      await metaDelete(`${META_GRAPH}/${externalId}`, ctx.accessToken);
    },

    async createAdSet(ctx: AdapterContext, input: AdapterAdSetInput): Promise<AdapterResourceRef> {
      const data = await metaPost(`${META_GRAPH}/${ctx.externalAccountId}/adsets`, ctx.accessToken, {
        name:                input.name,
        campaign_id:         input.externalCampaignId,
        status:              metaStatus(input.status),
        targeting:           metaTargeting(input.targeting),
        billing_event:       "IMPRESSIONS",
        optimization_goal:   input.optimizationGoal,
        bid_strategy:        input.bidStrategy === "AUTO" ? "LOWEST_COST_WITHOUT_CAP" : input.bidStrategy,
        ...(input.bidAmountCents != null         ? { bid_amount: input.bidAmountCents } : {}),
        ...(input.dailyBudgetCents != null       ? { daily_budget: input.dailyBudgetCents } : {}),
        ...(input.lifetimeBudgetCents != null    ? { lifetime_budget: input.lifetimeBudgetCents } : {}),
        ...(input.startAt                        ? { start_time: input.startAt.toISOString() } : {}),
        ...(input.endAt                          ? { end_time:   input.endAt.toISOString() } : {}),
        ...(input.frequencyCapImpressions && input.frequencyCapHours
          ? { frequency_control_specs: [{ event: "IMPRESSIONS", interval_days: Math.ceil(input.frequencyCapHours / 24), max_frequency: input.frequencyCapImpressions }] }
          : {}),
      });
      return { externalId: data.id, raw: data };
    },

    async updateAdSet(ctx: AdapterContext, externalId: string, input: Partial<AdapterAdSetInput>): Promise<AdapterResourceRef> {
      const body: Record<string, unknown> = {};
      if (input.name)             body.name = input.name;
      if (input.status)           body.status = metaStatus(input.status);
      if (input.targeting)        body.targeting = metaTargeting(input.targeting);
      if (input.dailyBudgetCents != null)    body.daily_budget = input.dailyBudgetCents;
      if (input.lifetimeBudgetCents != null) body.lifetime_budget = input.lifetimeBudgetCents;
      if (input.bidAmountCents != null)      body.bid_amount = input.bidAmountCents;
      const data = await metaPost(`${META_GRAPH}/${externalId}`, ctx.accessToken, body);
      return { externalId, raw: data };
    },

    async deleteAdSet(ctx: AdapterContext, externalId: string): Promise<void> {
      await metaDelete(`${META_GRAPH}/${externalId}`, ctx.accessToken);
    },

    async createCreative(ctx: AdapterContext, input: AdapterCreativeInput): Promise<AdapterResourceRef> {
      // Single-image / single-video creative payload. Carousel requires
      // a different `object_story_spec.link_data.child_attachments` shape
      // which we'll handle when format === "carousel".
      const pageId = (input as any).metadata?.pageId ?? null;
      if (!pageId) {
        throw new PaidMediaAdapterError("meta", "VALIDATION_ERROR", "Meta creative requires metadata.pageId (Facebook Page id)");
      }
      const linkData: Record<string, unknown> = {
        link:        (input as any).destinationUrl ?? input.assets[0]?.destinationUrl ?? "",
        message:     input.primaryText ?? "",
        name:        input.headline ?? "",
        description: input.description ?? "",
        ...(input.assetUrl ? { picture: input.assetUrl } : {}),
        call_to_action: { type: metaCta(input.ctaText), value: { link: input.assetUrl ?? "" } },
      };
      const data = await metaPost(`${META_GRAPH}/${ctx.externalAccountId}/adcreatives`, ctx.accessToken, {
        name:               input.name,
        object_story_spec:  { page_id: pageId, link_data: linkData },
      });
      return { externalId: data.id, raw: data };
    },

    async createAd(ctx: AdapterContext, input: AdapterAdInput): Promise<AdapterResourceRef> {
      const trackingSpecs: Array<Record<string, unknown>> = [];
      const data = await metaPost(`${META_GRAPH}/${ctx.externalAccountId}/ads`, ctx.accessToken, {
        name:        input.name,
        adset_id:    input.externalAdSetId,
        creative:    { creative_id: input.externalCreativeId },
        status:      metaStatus(input.status),
        tracking_specs: trackingSpecs,
      });
      return { externalId: data.id, raw: data };
    },

    async updateAd(ctx: AdapterContext, externalId: string, input: Partial<AdapterAdInput>): Promise<AdapterResourceRef> {
      const body: Record<string, unknown> = {};
      if (input.name)   body.name = input.name;
      if (input.status) body.status = metaStatus(input.status);
      const data = await metaPost(`${META_GRAPH}/${externalId}`, ctx.accessToken, body);
      return { externalId, raw: data };
    },

    async deleteAd(ctx: AdapterContext, externalId: string): Promise<void> {
      await metaDelete(`${META_GRAPH}/${externalId}`, ctx.accessToken);
    },

    async pullInsights(ctx: AdapterContext, query: InsightsQuery): Promise<InsightRow[]> {
      const level = query.resourceKind === "campaign" ? "campaign" : query.resourceKind === "ad_set" ? "adset" : "ad";
      const params = new URLSearchParams({
        level,
        fields: "campaign_id,adset_id,ad_id,impressions,clicks,spend,actions,video_p100_watched_actions,date_start",
        time_range: JSON.stringify({ since: query.since, until: query.until }),
        time_increment: "1",
        ...(query.externalIds?.length ? { filtering: JSON.stringify([{ field: `${level}.id`, operator: "IN", value: query.externalIds }]) } : {}),
      });
      const res = await metaGet(`${META_GRAPH}/${ctx.externalAccountId}/insights?${params.toString()}`, ctx.accessToken);
      const rows: InsightRow[] = [];
      for (const r of (res.data ?? []) as Array<any>) {
        const externalId = r.ad_id ?? r.adset_id ?? r.campaign_id;
        if (!externalId) continue;
        const conversions = (r.actions ?? [])
          .filter((a: any) => a.action_type === "offsite_conversion" || a.action_type === "lead")
          .reduce((sum: number, a: any) => sum + Number(a.value ?? 0), 0);
        const videoViews = (r.video_p100_watched_actions ?? [])
          .reduce((sum: number, a: any) => sum + Number(a.value ?? 0), 0);
        rows.push({
          externalId,
          resourceKind: query.resourceKind,
          date:         r.date_start,
          impressions:  Number(r.impressions ?? 0),
          clicks:       Number(r.clicks ?? 0),
          spendCents:   Math.round(Number(r.spend ?? 0) * 100),
          conversions,
          videoViews,
          rawMetrics:   r,
        });
      }
      return rows;
    },
  };
}
