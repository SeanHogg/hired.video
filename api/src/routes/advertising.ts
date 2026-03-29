import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, sum, sql } from "drizzle-orm";
import type { Variables } from "../types/index.js";
import { getDb, schema } from "../db/index.js";

export const advertisingRoutes = new Hono<{ Variables: Variables }>();

function uid(c: any): string {
  return c.var.user?.sub as string;
}

function ok<T>(data: T) {
  return { success: true as const, data };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ctr(impressions: number, clicks: number): number {
  return impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0;
}

function costPerClick(spentCents: number, clicks: number): number | null {
  return clicks > 0 ? Math.round(spentCents / clicks) / 100 : null;
}

// ─── Job Boosts (gap #106) ────────────────────────────────────────────────────

const CreateBoostSchema = z.object({
  jobId:         z.string().uuid(),
  placementType: z.enum(["search_top", "discovery_feed", "both"]),
  pricingModel:  z.enum(["cpm", "cpc"]),
  budgetCents:   z.number().int().min(1000), // minimum $10
  durationDays:  z.number().int().min(1).max(90),
});

// GET /api/advertising/boosts — list user's boosts with job title joined
advertisingRoutes.get("/boosts", async (c) => {
  const userId = uid(c);
  const db = getDb();
  const boosts = await db
    .select()
    .from(schema.jobBoosts)
    .where(eq(schema.jobBoosts.userId, userId))
    .orderBy(desc(schema.jobBoosts.createdAt));

  // Enrich with job titles
  const jobIds = [...new Set(boosts.map((b) => b.jobId))];
  let jobTitleMap: Record<string, string> = {};
  if (jobIds.length > 0) {
    const jobs = await db
      .select({ id: schema.jobItems.id, title: schema.jobItems.title })
      .from(schema.jobItems)
      .where(sql`${schema.jobItems.id} = ANY(${jobIds})`);
    jobTitleMap = Object.fromEntries(jobs.map((j) => [j.id, j.title]));
  }

  return c.json(ok(boosts.map((b) => ({
    ...b,
    jobTitle: jobTitleMap[b.jobId] ?? "Unknown Job",
    budgetDollars: b.budgetCents / 100,
    spentDollars: b.spentCents / 100,
    ctr: ctr(b.impressions, b.clicks),
    costPerClick: costPerClick(b.spentCents, b.clicks),
  }))));
});

// POST /api/advertising/boosts — create a new job boost
advertisingRoutes.post("/boosts", async (c) => {
  const userId = uid(c);
  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateBoostSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } }, 400);
  }
  const { jobId, placementType, pricingModel, budgetCents, durationDays } = parsed.data;
  const db = getDb();

  // Verify job ownership
  const [job] = await db.select().from(schema.jobItems).where(and(eq(schema.jobItems.id, jobId), eq(schema.jobItems.userId, userId))).limit(1);
  if (!job) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Job not found or not owned by you" } }, 404);

  const endsAt = new Date();
  endsAt.setDate(endsAt.getDate() + durationDays);

  const [boost] = await db.insert(schema.jobBoosts).values({
    jobId,
    userId,
    placementType,
    pricingModel,
    budgetCents,
    endsAt,
    rateUnitCents: pricingModel === "cpc" ? 5 : 500, // $0.05 CPC or $5.00 CPM
  }).returning();

  // Mark job as sponsored
  await db.update(schema.jobItems)
    .set({ sponsored: true, sponsoredUntil: endsAt, sponsoredRankBoost: 10 })
    .where(eq(schema.jobItems.id, jobId));

  return c.json(ok(boost), 201);
});

// PATCH /api/advertising/boosts/:id/pause — pause a boost
advertisingRoutes.patch("/boosts/:id/pause", async (c) => {
  const userId = uid(c);
  const db = getDb();
  const [boost] = await db.update(schema.jobBoosts)
    .set({ status: "paused", updatedAt: new Date() })
    .where(and(eq(schema.jobBoosts.id, c.req.param("id")), eq(schema.jobBoosts.userId, userId)))
    .returning();
  if (!boost) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Boost not found" } }, 404);
  return c.json(ok(boost));
});

// PATCH /api/advertising/boosts/:id/resume — resume a paused boost
advertisingRoutes.patch("/boosts/:id/resume", async (c) => {
  const userId = uid(c);
  const db = getDb();
  const [boost] = await db.update(schema.jobBoosts)
    .set({ status: "active", updatedAt: new Date() })
    .where(and(eq(schema.jobBoosts.id, c.req.param("id")), eq(schema.jobBoosts.userId, userId)))
    .returning();
  if (!boost) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Boost not found" } }, 404);
  return c.json(ok(boost));
});

// DELETE /api/advertising/boosts/:id — cancel boost and unsponsor the job
advertisingRoutes.delete("/boosts/:id", async (c) => {
  const userId = uid(c);
  const db = getDb();
  const [boost] = await db.select().from(schema.jobBoosts)
    .where(and(eq(schema.jobBoosts.id, c.req.param("id")), eq(schema.jobBoosts.userId, userId)))
    .limit(1);
  if (!boost) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Boost not found" } }, 404);

  await db.update(schema.jobBoosts).set({ status: "cancelled", updatedAt: new Date() }).where(eq(schema.jobBoosts.id, boost.id));
  await db.update(schema.jobItems).set({ sponsored: false, sponsoredUntil: null, sponsoredRankBoost: 0 }).where(eq(schema.jobItems.id, boost.jobId));

  return c.json(ok({ cancelled: true }));
});

// ─── Ad Campaigns (gap #108) ──────────────────────────────────────────────────

const CreateCampaignSchema = z.object({
  name:        z.string().min(1).max(120),
  objective:   z.enum(["AWARENESS", "TRAFFIC", "APPLICATIONS", "EMPLOYER_BRAND"]).default("TRAFFIC"),
  budgetCents: z.number().int().min(0).optional(),
  startAt:     z.string().datetime().optional(),
  endAt:       z.string().datetime().optional(),
  notes:       z.string().max(500).optional(),
});

advertisingRoutes.get("/campaigns", async (c) => {
  const db = getDb();
  const campaigns = await db.select().from(schema.adCampaigns)
    .where(eq(schema.adCampaigns.userId, uid(c)))
    .orderBy(desc(schema.adCampaigns.createdAt));
  return c.json(ok(campaigns));
});

advertisingRoutes.post("/campaigns", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateCampaignSchema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } }, 400);

  const db = getDb();
  const [campaign] = await db.insert(schema.adCampaigns).values({
    userId: uid(c),
    ...parsed.data,
    startAt: parsed.data.startAt ? new Date(parsed.data.startAt) : undefined,
    endAt: parsed.data.endAt ? new Date(parsed.data.endAt) : undefined,
  }).returning();
  return c.json(ok(campaign), 201);
});

advertisingRoutes.put("/campaigns/:id", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateCampaignSchema.partial().safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } }, 400);

  const db = getDb();
  const [campaign] = await db.update(schema.adCampaigns)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(schema.adCampaigns.id, c.req.param("id")), eq(schema.adCampaigns.userId, uid(c))))
    .returning();
  if (!campaign) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Campaign not found" } }, 404);
  return c.json(ok(campaign));
});

advertisingRoutes.delete("/campaigns/:id", async (c) => {
  const db = getDb();
  const [deleted] = await db.delete(schema.adCampaigns)
    .where(and(eq(schema.adCampaigns.id, c.req.param("id")), eq(schema.adCampaigns.userId, uid(c))))
    .returning();
  if (!deleted) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Campaign not found" } }, 404);
  return c.json(ok({ deleted: true }));
});

// ─── Ad Sets (gap #108/#109) ──────────────────────────────────────────────────

const CreateAdSetSchema = z.object({
  name:              z.string().min(1).max(120),
  placementType:     z.enum(["search_top", "discovery_feed", "both", "email", "push"]).default("search_top"),
  pricingModel:      z.enum(["cpm", "cpc", "auto"]).default("cpc"),
  bidStrategy:       z.enum(["manual", "maximize_clicks", "maximize_impressions", "target_cpa"]).default("manual"),
  bidAmountCents:    z.number().int().min(1).optional(),
  budgetCents:       z.number().int().min(0).optional(),
  targetingJson:     z.record(z.unknown()).optional().default({}),
  frequencyCapCount: z.number().int().min(1).max(100).optional(),
  frequencyCapHours: z.number().int().min(1).max(168).optional(),
  startAt:           z.string().datetime().optional(),
  endAt:             z.string().datetime().optional(),
});

advertisingRoutes.get("/campaigns/:id/ad-sets", async (c) => {
  const db = getDb();
  // Verify campaign ownership first
  const [campaign] = await db.select().from(schema.adCampaigns)
    .where(and(eq(schema.adCampaigns.id, c.req.param("id")), eq(schema.adCampaigns.userId, uid(c)))).limit(1);
  if (!campaign) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Campaign not found" } }, 404);

  const adSets = await db.select().from(schema.adSets)
    .where(eq(schema.adSets.campaignId, c.req.param("id")))
    .orderBy(desc(schema.adSets.createdAt));
  return c.json(ok(adSets));
});

advertisingRoutes.post("/campaigns/:id/ad-sets", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateAdSetSchema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } }, 400);

  const db = getDb();
  const [campaign] = await db.select().from(schema.adCampaigns)
    .where(and(eq(schema.adCampaigns.id, c.req.param("id")), eq(schema.adCampaigns.userId, uid(c)))).limit(1);
  if (!campaign) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Campaign not found" } }, 404);

  const [adSet] = await db.insert(schema.adSets).values({
    campaignId: c.req.param("id"),
    userId: uid(c),
    ...parsed.data,
    targetingJson: parsed.data.targetingJson ?? {},
    startAt: parsed.data.startAt ? new Date(parsed.data.startAt) : undefined,
    endAt: parsed.data.endAt ? new Date(parsed.data.endAt) : undefined,
  }).returning();
  return c.json(ok(adSet), 201);
});

advertisingRoutes.put("/ad-sets/:id", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateAdSetSchema.partial().safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } }, 400);

  const db = getDb();
  const [adSet] = await db.update(schema.adSets)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(schema.adSets.id, c.req.param("id")), eq(schema.adSets.userId, uid(c))))
    .returning();
  if (!adSet) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Ad set not found" } }, 404);
  return c.json(ok(adSet));
});

advertisingRoutes.delete("/ad-sets/:id", async (c) => {
  const db = getDb();
  const [deleted] = await db.delete(schema.adSets)
    .where(and(eq(schema.adSets.id, c.req.param("id")), eq(schema.adSets.userId, uid(c))))
    .returning();
  if (!deleted) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Ad set not found" } }, 404);
  return c.json(ok({ deleted: true }));
});

// ─── Ads / Creatives (gap #110) ───────────────────────────────────────────────

const CreateAdSchema = z.object({
  name:           z.string().min(1).max(120),
  headline:       z.string().min(1).max(150),
  description:    z.string().max(300).optional(),
  ctaText:        z.enum(["Apply Now", "Learn More", "Watch Our Story", "View Jobs", "Get Started"]).default("Apply Now"),
  ctaUrl:         z.string().url().optional(),
  imageUrl:       z.string().url().optional(),
  videoUrl:       z.string().url().optional(),
  destinationUrl: z.string().url().optional(),
  variantGroup:   z.enum(["A", "B"]).optional(),
});

advertisingRoutes.get("/ad-sets/:id/ads", async (c) => {
  const db = getDb();
  const [adSet] = await db.select().from(schema.adSets)
    .where(and(eq(schema.adSets.id, c.req.param("id")), eq(schema.adSets.userId, uid(c)))).limit(1);
  if (!adSet) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Ad set not found" } }, 404);

  const ads = await db.select().from(schema.ads)
    .where(eq(schema.ads.adSetId, c.req.param("id")))
    .orderBy(desc(schema.ads.createdAt));
  return c.json(ok(ads.map((a) => ({ ...a, ctr: ctr(a.impressions, a.clicks) }))));
});

advertisingRoutes.post("/ad-sets/:id/ads", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateAdSchema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } }, 400);

  const db = getDb();
  const [adSet] = await db.select().from(schema.adSets)
    .where(and(eq(schema.adSets.id, c.req.param("id")), eq(schema.adSets.userId, uid(c)))).limit(1);
  if (!adSet) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Ad set not found" } }, 404);

  const [ad] = await db.insert(schema.ads).values({
    adSetId: c.req.param("id"),
    userId: uid(c),
    ...parsed.data,
  }).returning();
  return c.json(ok(ad), 201);
});

advertisingRoutes.put("/ads/:id", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateAdSchema.partial().safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } }, 400);

  const db = getDb();
  const [ad] = await db.update(schema.ads)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(schema.ads.id, c.req.param("id")), eq(schema.ads.userId, uid(c))))
    .returning();
  if (!ad) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Ad not found" } }, 404);
  return c.json(ok(ad));
});

advertisingRoutes.delete("/ads/:id", async (c) => {
  const db = getDb();
  const [deleted] = await db.delete(schema.ads)
    .where(and(eq(schema.ads.id, c.req.param("id")), eq(schema.ads.userId, uid(c))))
    .returning();
  if (!deleted) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Ad not found" } }, 404);
  return c.json(ok({ deleted: true }));
});

// ─── Advertising Stats (gap #111) ─────────────────────────────────────────────

// GET /api/advertising/stats — aggregate KPIs for the authenticated user
advertisingRoutes.get("/stats", async (c) => {
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

// ─── Enrichment Credits (gap #96) ─────────────────────────────────────────────

// GET /api/advertising/enrichment/credits
advertisingRoutes.get("/enrichment/credits", async (c) => {
  const userId = uid(c);
  const db = getDb();
  let [credits] = await db.select().from(schema.enrichmentCredits).where(eq(schema.enrichmentCredits.userId, userId)).limit(1);
  if (!credits) {
    // Auto-provision for Pro users: 25 monthly included credits
    [credits] = await db.insert(schema.enrichmentCredits).values({ userId, balance: 0 }).returning();
  }
  return c.json(ok(credits));
});

// GET /api/advertising/enrichment/transactions
advertisingRoutes.get("/enrichment/transactions", async (c) => {
  const userId = uid(c);
  const db = getDb();
  const transactions = await db.select().from(schema.enrichmentTransactions)
    .where(eq(schema.enrichmentTransactions.userId, userId))
    .orderBy(desc(schema.enrichmentTransactions.createdAt))
    .limit(50);
  return c.json(ok(transactions));
});

// POST /api/advertising/enrichment/enrich — enrich a contact (deducts 1 credit)
advertisingRoutes.post("/enrichment/enrich", async (c) => {
  const userId = uid(c);
  const body = await c.req.json().catch(() => ({}));
  const { email, name, company } = body as { email?: string; name?: string; company?: string };
  if (!email && !name) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: "email or name is required" } }, 400);

  const db = getDb();
  let [credits] = await db.select().from(schema.enrichmentCredits).where(eq(schema.enrichmentCredits.userId, userId)).limit(1);
  if (!credits || credits.balance < 1) {
    return c.json({ success: false, error: { code: "INSUFFICIENT_CREDITS", message: "No enrichment credits remaining. Purchase a pack to continue." } }, 402);
  }

  // Deduct credit
  const newBalance = credits.balance - 1;
  await db.update(schema.enrichmentCredits)
    .set({ balance: newBalance, totalConsumed: credits.totalConsumed + 1, updatedAt: new Date() })
    .where(eq(schema.enrichmentCredits.userId, userId));

  await db.insert(schema.enrichmentTransactions).values({
    userId,
    type: "deduction",
    amount: -1,
    balanceAfter: newBalance,
    description: `Contact enrichment: ${email ?? name}`,
  });

  // TODO: Call PeopleDataLabs/Hunter.io API when ENRICHMENT_API_KEY is configured
  // For now return a stub response indicating enrichment was requested
  const enriched = {
    email: email ?? null,
    name: name ?? null,
    company: company ?? null,
    linkedInUrl: null,
    phone: null,
    title: null,
    enriched: false, // will be true when API key is configured
    creditsRemaining: newBalance,
    message: "Enrichment API key not yet configured. Data will populate once ENRICHMENT_API_KEY is set.",
  };

  return c.json(ok(enriched));
});
