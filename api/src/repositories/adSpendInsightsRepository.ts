/**
 * AdSpendInsightsRepository — read model over a user's paid placements
 * (`job_boosts`, `company_boosts`, `ad_campaigns`) for the advertising KPI
 * tiles and the ROAS / funnel dashboard (#111). Reads only; the arithmetic
 * lives in services/advertising/insights.ts.
 */
import { and, eq, gte, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";

const { jobBoosts, companyBoosts, adCampaigns } = schema;

export type JobBoostRow = typeof jobBoosts.$inferSelect;
export type CompanyBoostRow = typeof companyBoosts.$inferSelect;
export type AdCampaignRow = typeof adCampaigns.$inferSelect;

export interface BoostTotals {
  totalSpentCents: number;
  totalImpressions: number;
  totalClicks: number;
  totalApplications: number;
  activeBoosts: number;
}

export interface CampaignTotals {
  totalCampaignSpentCents: number;
  activeCampaigns: number;
  totalCampaigns: number;
}

// SUM/COUNT come back as bigint (a string on the wire) — map to numbers so
// the totals add instead of concatenating.
const n = (expr: SQL) => expr.mapWith(Number);

/** All-time job-boost totals for the user. */
export async function sumJobBoostTotals(userId: string): Promise<BoostTotals | undefined> {
  const [row] = await getDb()
    .select({
      totalSpentCents: n(sql`COALESCE(SUM(${jobBoosts.spentCents}), 0)`),
      totalImpressions: n(sql`COALESCE(SUM(${jobBoosts.impressions}), 0)`),
      totalClicks: n(sql`COALESCE(SUM(${jobBoosts.clicks}), 0)`),
      totalApplications: n(sql`COALESCE(SUM(${jobBoosts.applications}), 0)`),
      activeBoosts: n(sql`COUNT(*) FILTER (WHERE ${jobBoosts.status} = 'active')`),
    })
    .from(jobBoosts)
    .where(eq(jobBoosts.userId, userId));
  return row;
}

/** All-time ad-campaign totals for the user. */
export async function sumAdCampaignTotals(userId: string): Promise<CampaignTotals | undefined> {
  const [row] = await getDb()
    .select({
      totalCampaignSpentCents: n(sql`COALESCE(SUM(${adCampaigns.spentCents}), 0)`),
      activeCampaigns: n(sql`COUNT(*) FILTER (WHERE ${adCampaigns.status} = 'active')`),
      totalCampaigns: n(sql`COUNT(*)`),
    })
    .from(adCampaigns)
    .where(eq(adCampaigns.userId, userId));
  return row;
}

export async function listJobBoostsSince(userId: string, since: Date): Promise<JobBoostRow[]> {
  return getDb().select().from(jobBoosts).where(and(eq(jobBoosts.userId, userId), gte(jobBoosts.createdAt, since)));
}

export async function listCompanyBoostsSince(userId: string, since: Date): Promise<CompanyBoostRow[]> {
  return getDb()
    .select()
    .from(companyBoosts)
    .where(and(eq(companyBoosts.userId, userId), gte(companyBoosts.createdAt, since)));
}

export async function listAdCampaignsSince(userId: string, since: Date): Promise<AdCampaignRow[]> {
  return getDb().select().from(adCampaigns).where(and(eq(adCampaigns.userId, userId), gte(adCampaigns.createdAt, since)));
}
