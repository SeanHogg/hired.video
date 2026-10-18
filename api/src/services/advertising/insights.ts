/**
 * Advertising insights (#111): the KPI tiles and the unified ROAS + funnel
 * dashboard across paid placements (job boosts, company boosts, ad
 * campaigns) attributed to placements (hires + fee revenue).
 */
import {
  listAdCampaignsSince,
  listCompanyBoostsSince,
  listJobBoostsSince,
  sumAdCampaignTotals,
  sumJobBoostTotals,
} from "../../repositories/adSpendInsightsRepository.js";
import { listPlacementsForRecruiterSince } from "../../repositories/placementsRepository.js";
import { costPerClick, ctr } from "./metrics.js";

/** Aggregate KPIs across every boost and ad campaign the user owns. */
export async function getAdvertisingStats(userId: string) {
  const [boostStats, campaignStats] = await Promise.all([sumJobBoostTotals(userId), sumAdCampaignTotals(userId)]);

  const totalSpentCents = (boostStats?.totalSpentCents ?? 0) + (campaignStats?.totalCampaignSpentCents ?? 0);
  const totalImpressions = boostStats?.totalImpressions ?? 0;
  const totalClicks = boostStats?.totalClicks ?? 0;
  const totalApplications = boostStats?.totalApplications ?? 0;

  return {
    totalSpentDollars: totalSpentCents / 100,
    totalImpressions,
    totalClicks,
    totalApplications,
    ctr: ctr(totalImpressions, totalClicks),
    costPerClick: costPerClick(totalSpentCents, totalClicks),
    costPerApplication: totalApplications > 0 ? Math.round(totalSpentCents / totalApplications) / 100 : null,
    activeBoosts: boostStats?.activeBoosts ?? 0,
    activeCampaigns: campaignStats?.activeCampaigns ?? 0,
    totalCampaigns: campaignStats?.totalCampaigns ?? 0,
  };
}

const sum = <T>(rows: T[], pick: (r: T) => number | null | undefined) =>
  rows.reduce((a, r) => a + (pick(r) ?? 0), 0);

const toCents = (v: unknown) => (v ? Math.round(parseFloat(String(v)) * 100) : 0);

/** The ROAS / funnel dashboard over the last `fromDays` days (1..365). */
export async function getAdvertisingDashboard(userId: string, fromDays: number) {
  const fromDate = new Date(Date.now() - fromDays * 86400_000);
  const [jb, cb, camp, hires] = await Promise.all([
    listJobBoostsSince(userId, fromDate),
    listCompanyBoostsSince(userId, fromDate),
    listAdCampaignsSince(userId, fromDate),
    listPlacementsForRecruiterSince(userId, fromDate),
  ]);

  const jbStats = {
    count: jb.length,
    impressions: sum(jb, (b) => b.impressions),
    clicks: sum(jb, (b) => b.clicks),
    applications: sum(jb, (b) => b.applications),
    spentCents: sum(jb, (b) => b.spentCents),
    budgetCents: sum(jb, (b) => b.budgetCents),
  };
  const cbStats = {
    count: cb.length,
    impressions: sum(cb, (b) => b.impressions),
    clicks: sum(cb, (b) => b.clicks),
    follows: sum(cb, (b) => b.follows),
    spentCents: sum(cb, (b) => b.spentCents),
    budgetCents: sum(cb, (b) => b.budgetCents),
  };
  const campStats = {
    count: camp.length,
    spentCents: sum(camp, (b) => b.spentCents),
    budgetCents: sum(camp, (b) => b.budgetCents),
    activeCount: camp.filter((c) => c.status === "active").length,
  };

  const totalHires = hires.length;
  const totalFeeCents = hires.reduce((a, h) => a + toCents(h.fee), 0);
  const totalCommissionCents = hires.reduce((a, h) => a + toCents(h.commissionAmount), 0);

  const totalSpentCents = jbStats.spentCents + cbStats.spentCents + campStats.spentCents;
  const totalImpressions = jbStats.impressions + cbStats.impressions;
  const totalClicks = jbStats.clicks + cbStats.clicks;
  const totalApplications = jbStats.applications;

  return {
    rangeDays: fromDays,
    sources: { jobBoosts: jbStats, companyBoosts: cbStats, campaigns: campStats },
    aggregates: {
      totalSpentCents,
      totalImpressions,
      totalClicks,
      totalApplications,
      totalHires,
      totalFeeCents,
      totalCommissionCents,
      ctrPct: ctr(totalImpressions, totalClicks),
      cpc: costPerClick(totalSpentCents, totalClicks),
      cpaCents: totalApplications > 0 ? Math.round(totalSpentCents / totalApplications) : null,
      cphCents: totalHires > 0 ? Math.round(totalSpentCents / totalHires) : null,
      // ROAS = (placement fee revenue) / ad spend
      roas: totalSpentCents > 0 ? Math.round((totalFeeCents / totalSpentCents) * 100) / 100 : null,
    },
    funnel: [
      { stage: "Impressions", count: totalImpressions },
      { stage: "Clicks", count: totalClicks },
      { stage: "Applications", count: totalApplications },
      { stage: "Hires", count: totalHires },
    ],
  };
}
