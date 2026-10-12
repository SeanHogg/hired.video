/**
 * /api/advertising — KPI stats and the ROAS / funnel dashboard (#111).
 */

import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";
import type { AppEnv } from "../../types/index.js";
import { getDb, schema } from "../../db/index.js";
import { costPerClick, ctr } from "../../services/advertising/metrics.js";
import { ok, uid } from "./http.js";

export const advertisingInsightRoutes = new Hono<AppEnv>();

// ─── Advertising Stats (gap #111) ─────────────────────────────────────────────

// GET /api/advertising/stats — aggregate KPIs for the authenticated user
advertisingInsightRoutes.get("/stats", async (c) => {
  const userId = uid(c);
  const db = getDb();

  // Aggregate across all active/completed boosts
  const [boostStats] = await db
    .select({
      totalSpentCents: sql<number>`COALESCE(SUM(${schema.jobBoosts.spentCents}), 0)`,
      totalImpressions: sql<number>`COALESCE(SUM(${schema.jobBoosts.impressions}), 0)`,
      totalClicks: sql<number>`COALESCE(SUM(${schema.jobBoosts.clicks}), 0)`,
      totalApplications: sql<number>`COALESCE(SUM(${schema.jobBoosts.applications}), 0)`,
      activeBoosts: sql<number>`COUNT(*) FILTER (WHERE ${schema.jobBoosts.status} = 'active')`,
    })
    .from(schema.jobBoosts)
    .where(eq(schema.jobBoosts.userId, userId));

  // Aggregate across all ad campaigns
  const [campaignStats] = await db
    .select({
      totalCampaignSpentCents: sql<number>`COALESCE(SUM(${schema.adCampaigns.spentCents}), 0)`,
      activeCampaigns: sql<number>`COUNT(*) FILTER (WHERE ${schema.adCampaigns.status} = 'active')`,
      totalCampaigns: sql<number>`COUNT(*)`,
    })
    .from(schema.adCampaigns)
    .where(eq(schema.adCampaigns.userId, userId));

  const totalSpentCents = (boostStats?.totalSpentCents ?? 0) + (campaignStats?.totalCampaignSpentCents ?? 0);
  const totalImpressions = boostStats?.totalImpressions ?? 0;
  const totalClicks = boostStats?.totalClicks ?? 0;
  const totalApplications = boostStats?.totalApplications ?? 0;

  return c.json(ok({
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
  }));
});

// ─── Advertising Analytics Dashboard (gap #111) ───────────────────────────────
// Unified ROAS + funnel reporting across paid placements (jobBoosts +
// companyBoosts + adCampaigns) and email/messaging campaigns. Joins
// `placements` to compute hires + revenue attribution.

advertisingInsightRoutes.get("/analytics/dashboard", async (c) => {
  const userId = uid(c);
  const db = getDb();

  const fromDays = Math.min(365, Math.max(1, parseInt(c.req.query("days") ?? "30", 10) || 30));
  const fromDate = new Date(Date.now() - fromDays * 86400_000);

  // ─── Job boosts ────────────────────────────────────────────────────────────
  const jb = await db.select().from(schema.jobBoosts)
    .where(and(
      eq(schema.jobBoosts.userId, userId),
      sql`${schema.jobBoosts.createdAt} >= ${fromDate}`,
    ));

  const jbStats = {
    count: jb.length,
    impressions: jb.reduce((a, b) => a + (b.impressions ?? 0), 0),
    clicks: jb.reduce((a, b) => a + (b.clicks ?? 0), 0),
    applications: jb.reduce((a, b) => a + (b.applications ?? 0), 0),
    spentCents: jb.reduce((a, b) => a + (b.spentCents ?? 0), 0),
    budgetCents: jb.reduce((a, b) => a + (b.budgetCents ?? 0), 0),
  };

  // ─── Company boosts ────────────────────────────────────────────────────────
  const cb = await db.select().from(schema.companyBoosts)
    .where(and(
      eq(schema.companyBoosts.userId, userId),
      sql`${schema.companyBoosts.createdAt} >= ${fromDate}`,
    ));

  const cbStats = {
    count: cb.length,
    impressions: cb.reduce((a, b) => a + (b.impressions ?? 0), 0),
    clicks: cb.reduce((a, b) => a + (b.clicks ?? 0), 0),
    follows: cb.reduce((a, b) => a + (b.follows ?? 0), 0),
    spentCents: cb.reduce((a, b) => a + (b.spentCents ?? 0), 0),
    budgetCents: cb.reduce((a, b) => a + (b.budgetCents ?? 0), 0),
  };

  // ─── Ad campaigns (#108) ───────────────────────────────────────────────────
  const camp = await db.select().from(schema.adCampaigns)
    .where(and(
      eq(schema.adCampaigns.userId, userId),
      sql`${schema.adCampaigns.createdAt} >= ${fromDate}`,
    ));

  const campStats = {
    count: camp.length,
    spentCents: camp.reduce((a, b) => a + (b.spentCents ?? 0), 0),
    budgetCents: camp.reduce((a, b) => a + (b.budgetCents ?? 0), 0),
    activeCount: camp.filter((c) => c.status === "active").length,
  };

  // ─── Hires + revenue (placements #50/#51) ──────────────────────────────────
  const hires = await db.select().from(schema.placements)
    .where(and(
      eq(schema.placements.recruiterId, userId as any),
      sql`${schema.placements.createdAt} >= ${fromDate}`,
    ));

  const totalHires = hires.length;
  const totalFeeCents = hires.reduce(
    (a, h) => a + (h.fee ? Math.round(parseFloat(String(h.fee)) * 100) : 0),
    0,
  );
  const totalCommissionCents = hires.reduce(
    (a, h) => a + (h.commissionAmount ? Math.round(parseFloat(String(h.commissionAmount)) * 100) : 0),
    0,
  );

  // ─── Aggregates ────────────────────────────────────────────────────────────
  const totalSpentCents = jbStats.spentCents + cbStats.spentCents + campStats.spentCents;
  const totalImpressions = jbStats.impressions + cbStats.impressions;
  const totalClicks = jbStats.clicks + cbStats.clicks;
  const totalApplications = jbStats.applications;

  const ctrPct = ctr(totalImpressions, totalClicks);
  const cpc = costPerClick(totalSpentCents, totalClicks);
  const cpaCents = totalApplications > 0 ? Math.round(totalSpentCents / totalApplications) : null;
  const cphCents = totalHires > 0 ? Math.round(totalSpentCents / totalHires) : null;

  // ROAS = (placement fee revenue) / ad spend
  const roas = totalSpentCents > 0 ? Math.round((totalFeeCents / totalSpentCents) * 100) / 100 : null;

  // Funnel
  const funnel = [
    { stage: "Impressions", count: totalImpressions },
    { stage: "Clicks",      count: totalClicks },
    { stage: "Applications", count: totalApplications },
    { stage: "Hires",        count: totalHires },
  ];

  return c.json(ok({
    rangeDays: fromDays,
    sources: {
      jobBoosts: jbStats,
      companyBoosts: cbStats,
      campaigns: campStats,
    },
    aggregates: {
      totalSpentCents,
      totalImpressions,
      totalClicks,
      totalApplications,
      totalHires,
      totalFeeCents,
      totalCommissionCents,
      ctrPct,
      cpc,
      cpaCents,
      cphCents,
      roas,
    },
    funnel,
  }));
});
