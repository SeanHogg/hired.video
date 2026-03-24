import { Hono } from "hono";
import { and, avg, count, desc, eq, gte, lt, sql } from "drizzle-orm";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { callLLMJson, getApiKey } from "../services/ai.js";
import { checkAIUsage, requirePremium } from "../middleware/tierEnforcement.js";

export const analyticsRoutes = new Hono<{ Variables: Variables }>();

// ---------------------------------------------------------------------------
// POST /api/analytics/beacon — lightweight client-side event tracker (#53)
// Public: no auth required. Accepts click/feature/pageview events from the
// frontend inline script and writes to activityLogs.
// ---------------------------------------------------------------------------
analyticsRoutes.post("/beacon", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const event = typeof body.event === "string" ? body.event.slice(0, 100) : "pageview";
  const entityType = typeof body.entityType === "string" ? body.entityType.slice(0, 100) : null;
  const entityId = typeof body.entityId === "string" ? body.entityId.slice(0, 36) : null;
  const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : null;
  const userId = (c.var as any).user?.sub ?? null;

  const db = getDb();
  await db.insert(schema.activityLogs).values({
    userId,
    action: event,
    entityType,
    entityId: entityId as any,
    metadata,
    ipAddress: c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
  } as any).catch(() => undefined); // fire-and-forget, never error the client

  return c.body(null, 204);
});

// ---------------------------------------------------------------------------
// POST /api/ads/impression — ad slot impression / click tracker (#52)
// Public: called by AdSlot component for every impression and click.
// ---------------------------------------------------------------------------
analyticsRoutes.post("/ads/impression", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const slotId = typeof body.slotId === "string" ? body.slotId.slice(0, 100) : "unknown";
  const action = body.action === "click" ? "ad_click" : "ad_impression";
  const userId = (c.var as any).user?.sub ?? null;

  const db = getDb();
  await db.insert(schema.activityLogs).values({
    userId,
    action,
    entityType: "ad_slot",
    entityId: null,
    metadata: { slotId, page: body.page ?? null },
    ipAddress: c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
  } as any).catch(() => undefined);

  return c.body(null, 204);
});

// ---------------------------------------------------------------------------
// GET /api/analytics/usage — admin feature adoption report (#53)
// Returns: top endpoints, DAU/WAU/MAU, top events, error rate
// ---------------------------------------------------------------------------
analyticsRoutes.get("/usage", async (c) => {
  const uid = (c.var as any).user?.sub;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const now = new Date();
  const day1 = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
  const day7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const day30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [dau, wau, mau, topEndpoints, errorRate, topEvents, adStats] = await Promise.all([
    // DAU — distinct users with a request log in last 24h
    db.select({ n: count(sql`DISTINCT ${schema.requestLogs.userId}`) })
      .from(schema.requestLogs)
      .where(gte(schema.requestLogs.createdAt, day1)),

    // WAU — last 7 days
    db.select({ n: count(sql`DISTINCT ${schema.requestLogs.userId}`) })
      .from(schema.requestLogs)
      .where(gte(schema.requestLogs.createdAt, day7)),

    // MAU — last 30 days
    db.select({ n: count(sql`DISTINCT ${schema.requestLogs.userId}`) })
      .from(schema.requestLogs)
      .where(gte(schema.requestLogs.createdAt, day30)),

    // Top endpoints by call volume (last 30 days)
    db.select({ path: schema.requestLogs.path, calls: count(), avgMs: avg(schema.requestLogs.durationMs) })
      .from(schema.requestLogs)
      .where(gte(schema.requestLogs.createdAt, day30))
      .groupBy(schema.requestLogs.path)
      .orderBy(desc(count()))
      .limit(20),

    // Error rate (status >= 400) last 30 days
    db.select({
      total: count(),
      errors: count(sql`CASE WHEN ${schema.requestLogs.statusCode} >= 400 THEN 1 END`),
    })
      .from(schema.requestLogs)
      .where(gte(schema.requestLogs.createdAt, day30)),

    // Top activity events (feature beacon) last 30 days
    db.select({ action: schema.activityLogs.action, n: count() })
      .from(schema.activityLogs)
      .where(gte(schema.activityLogs.createdAt, day30))
      .groupBy(schema.activityLogs.action)
      .orderBy(desc(count()))
      .limit(20),

    // Ad impressions and clicks last 30 days
    db.select({ action: schema.activityLogs.action, n: count() })
      .from(schema.activityLogs)
      .where(and(
        gte(schema.activityLogs.createdAt, day30),
        sql`${schema.activityLogs.action} IN ('ad_impression', 'ad_click')`,
      ))
      .groupBy(schema.activityLogs.action),
  ]);

  const totalReqs = errorRate[0]?.total ?? 0;
  const totalErrors = errorRate[0]?.errors ?? 0;
  const adImpressions = adStats.find((r) => r.action === "ad_impression")?.n ?? 0;
  const adClicks = adStats.find((r) => r.action === "ad_click")?.n ?? 0;

  return c.json(success({
    activeUsers: {
      dau: dau[0]?.n ?? 0,
      wau: wau[0]?.n ?? 0,
      mau: mau[0]?.n ?? 0,
    },
    topEndpoints: topEndpoints.map((r) => ({
      path: r.path,
      calls: r.calls,
      avgResponseMs: r.avgMs ? Math.round(Number(r.avgMs)) : null,
    })),
    errorRate: {
      totalRequests: totalReqs,
      totalErrors: totalErrors,
      rate: totalReqs > 0 ? Math.round((Number(totalErrors) / Number(totalReqs)) * 1000) / 10 : 0,
    },
    topFeatureEvents: topEvents.map((r) => ({ event: r.action, count: r.n })),
    adMetrics: {
      impressions: adImpressions,
      clicks: adClicks,
      ctr: adImpressions > 0 ? Math.round((Number(adClicks) / Number(adImpressions)) * 1000) / 10 : 0,
    },
  }), 200);
});

// ---------------------------------------------------------------------------
// GET /api/analytics/time-to-hire — time-to-hire analytics (#17)
// Requires Premium. Returns avg days from job creation to placement, with
// per-job breakdown and 6-month trend.
// ---------------------------------------------------------------------------
analyticsRoutes.get("/time-to-hire", requirePremium("Time-to-Hire Analytics"), async (c) => {
  const uid = c.var.user.sub;
  const from = c.req.query("from") ? new Date(c.req.query("from")!) : new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  const to = c.req.query("to") ? new Date(c.req.query("to")!) : new Date();
  const db = getDb();

  const rows = await db
    .select({
      id: schema.placements.id,
      jobId: schema.placements.jobId,
      jobTitle: schema.placements.jobTitle,
      createdAt: schema.placements.createdAt,
      startDate: schema.placements.startDate,
    })
    .from(schema.placements)
    .where(and(
      eq(schema.placements.recruiterId, uid),
      gte(schema.placements.createdAt, from),
      lt(schema.placements.createdAt, to),
    ));

  const withDays = rows
    .filter((r) => r.startDate)
    .map((r) => ({
      ...r,
      days: Math.round((new Date(r.startDate!).getTime() - new Date(r.createdAt).getTime()) / (1000 * 60 * 60 * 24)),
    }));

  const avgDays = withDays.length > 0
    ? Math.round(withDays.reduce((s, r) => s + r.days, 0) / withDays.length)
    : null;

  // Per-job breakdown
  const byJob = Object.values(
    withDays.reduce<Record<string, { jobId: string | null; jobTitle: string | null; count: number; totalDays: number }>>((acc, r) => {
      const key = r.jobId ?? "unknown";
      if (!acc[key]) acc[key] = { jobId: r.jobId, jobTitle: r.jobTitle, count: 0, totalDays: 0 };
      acc[key].count++;
      acc[key].totalDays += r.days;
      return acc;
    }, {}),
  ).map((j) => ({ ...j, avgDays: Math.round(j.totalDays / j.count) }));

  // Monthly trend (YYYY-MM buckets)
  const monthlyTrend: Record<string, { count: number; totalDays: number }> = {};
  for (const r of withDays) {
    const month = new Date(r.createdAt).toISOString().slice(0, 7);
    if (!monthlyTrend[month]) monthlyTrend[month] = { count: 0, totalDays: 0 };
    monthlyTrend[month].count++;
    monthlyTrend[month].totalDays += r.days;
  }
  const trend = Object.entries(monthlyTrend)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, d]) => ({ month, avgDays: Math.round(d.totalDays / d.count), count: d.count }));

  return c.json(success({ avgDays, totalPlacements: withDays.length, byJob, trend }), 200);
});

// ---------------------------------------------------------------------------
// GET /api/analytics/hiring-metrics — per-role pipeline conversion report (#16)
// Requires Premium. Returns application-to-hire funnel per job role, pipeline
// stage breakdown, and a monthly trend of hires.
// ---------------------------------------------------------------------------
analyticsRoutes.get("/hiring-metrics", requirePremium("Hiring Metrics"), async (c) => {
  const uid = c.var.user.sub;
  const from = c.req.query("from") ? new Date(c.req.query("from")!) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const to = c.req.query("to") ? new Date(c.req.query("to")!) : new Date();
  const db = getDb();

  // Applications to jobs posted by this user, within the date window
  const applications = await db
    .select({
      id: schema.jobApplications.id,
      jobId: schema.jobApplications.jobId,
      status: schema.jobApplications.status,
      appliedAt: schema.jobApplications.appliedAt,
      jobTitle: schema.jobItems.title,
    })
    .from(schema.jobApplications)
    .leftJoin(schema.jobItems, eq(schema.jobApplications.jobId, schema.jobItems.id))
    .where(
      and(
        eq((schema.jobItems as any).postedByUserId, uid),
        gte(schema.jobApplications.appliedAt, from),
        lt(schema.jobApplications.appliedAt, to),
      ),
    );

  // Placements (hires) within the date window
  const hirePlacements = await db
    .select({ jobId: schema.placements.jobId, jobTitle: schema.placements.jobTitle, createdAt: schema.placements.createdAt })
    .from(schema.placements)
    .where(
      and(
        eq(schema.placements.recruiterId, uid),
        gte(schema.placements.createdAt, from),
        lt(schema.placements.createdAt, to),
      ),
    );

  // Aggregate pipeline by job role
  const byRole: Record<string, {
    jobId: string | null;
    jobTitle: string | null;
    applied: number;
    reviewing: number;
    interviewed: number;
    offered: number;
    hired: number;
    rejected: number;
  }> = {};

  for (const app of applications) {
    const key = app.jobId ?? "unknown";
    if (!byRole[key]) {
      byRole[key] = { jobId: app.jobId, jobTitle: app.jobTitle ?? "Unknown Role", applied: 0, reviewing: 0, interviewed: 0, offered: 0, hired: 0, rejected: 0 };
    }
    const status = (app.status ?? "applied").toLowerCase();
    byRole[key].applied++;
    if (status === "reviewing") byRole[key].reviewing++;
    else if (status === "interviewed" || status === "interview") byRole[key].interviewed++;
    else if (status === "offered") byRole[key].offered++;
    else if (status === "hired" || status === "accepted") byRole[key].hired++;
    else if (status === "rejected" || status === "declined") byRole[key].rejected++;
  }

  // Supplement hired counts from placements table
  for (const p of hirePlacements) {
    const key = p.jobId ?? "unknown";
    if (!byRole[key]) {
      byRole[key] = { jobId: p.jobId, jobTitle: p.jobTitle ?? "Unknown Role", applied: 0, reviewing: 0, interviewed: 0, offered: 0, hired: 0, rejected: 0 };
    }
    byRole[key].hired = Math.max(byRole[key].hired, (byRole[key].hired || 0) + 1);
  }

  const roles = Object.values(byRole).map((r) => ({
    ...r,
    conversionRate: r.applied > 0 ? Math.round((r.hired / r.applied) * 1000) / 10 : 0,
  }));

  // Overall funnel totals
  const totals = roles.reduce(
    (acc, r) => {
      acc.applied += r.applied;
      acc.reviewing += r.reviewing;
      acc.interviewed += r.interviewed;
      acc.offered += r.offered;
      acc.hired += r.hired;
      acc.rejected += r.rejected;
      return acc;
    },
    { applied: 0, reviewing: 0, interviewed: 0, offered: 0, hired: 0, rejected: 0 },
  );

  // Monthly trend of hires (from placements)
  const monthlyHires: Record<string, number> = {};
  for (const p of hirePlacements) {
    const month = new Date(p.createdAt).toISOString().slice(0, 7);
    monthlyHires[month] = (monthlyHires[month] ?? 0) + 1;
  }
  const hireTrend = Object.entries(monthlyHires)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, hires]) => ({ month, hires }));

  return c.json(
    success({
      period: { from: from.toISOString(), to: to.toISOString() },
      funnel: totals,
      byRole: roles.sort((a, b) => b.applied - a.applied),
      hireTrend,
    }),
    200,
  );
});
