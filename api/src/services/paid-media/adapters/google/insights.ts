/**
 * Google Ads reporting — GAQL `googleAds:search` → platform-neutral InsightRow.
 */

import { adapterFetch, type AdapterConfig, type PaidMediaAdapter } from "../../ports/adapter.js";
import type { AdapterContext, InsightRow, InsightsQuery } from "../../ports/types.js";
import { GOOGLE_ADS_API, assertConfigured, gAuthHeaders } from "./http.js";

export function createGoogleInsights(config: AdapterConfig): Pick<PaidMediaAdapter, "pullInsights"> {
  return {
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
