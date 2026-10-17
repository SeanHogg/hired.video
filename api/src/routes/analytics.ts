import { Hono } from "hono";
import { and, eq, gte, lt } from "drizzle-orm";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { checkAIUsage, requirePro } from "../middleware/tierEnforcement.js";
import { isSuperAdmin } from "../middleware/superAdmin.js";

export const analyticsRoutes = new Hono<AppEnv>();

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
// GET /api/analytics/time-to-hire — time-to-hire analytics (#17)
// Requires Pro. Returns avg days from job creation to placement, with
// per-job breakdown and 6-month trend.
// ---------------------------------------------------------------------------
analyticsRoutes.get("/time-to-hire", requirePro("Time-to-Hire Analytics"), async (c) => {
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
// Requires Pro. Returns application-to-hire funnel per job role, pipeline
// stage breakdown, and a monthly trend of hires.
// ---------------------------------------------------------------------------
analyticsRoutes.get("/hiring-metrics", requirePro("Hiring Metrics"), async (c) => {
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

// ---------------------------------------------------------------------------
// Polymorphic artifact-views surface — Gap Register #1019.
// ---------------------------------------------------------------------------

import { recordArtifactView, ipCountryFromCtx } from "../services/analytics/artifactView.js";
import { getArtifactMetrics, lookupArtifactOwner } from "../services/analytics/artifactAnalytics.js";
import { ARTIFACT_KINDS, type ArtifactKind } from "../../../shared/artifact-views.js";
import { hashClientIp } from "../utils/crypto.js";

const beaconSchema = z.object({
  artifactKind: z.enum(ARTIFACT_KINDS as unknown as [ArtifactKind, ...ArtifactKind[]]),
  artifactId: UuidLikeSchema,
  engagement: z.array(z.number()).optional(),
  totalEngagementSec: z.number().int().nonnegative().optional(),
  percentConsumed: z.number().min(0).max(1).optional(),
  dropOffBucket: z.number().int().nonnegative().nullable().optional(),
  viewerEmail: z.string().email().optional().nullable(),
  viewerCompany: z.string().max(255).optional().nullable(),
  referrer: z.string().max(2048).optional().nullable(),
});

// POST /api/analytics/artifacts/beacon — public; never auth-required.
// Records a single artifact view event. The owner of the artifact is
// looked up server-side per-kind so the client can't spoof attribution.
analyticsRoutes.post("/artifacts/beacon", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = beaconSchema.safeParse(raw);
  if (!parsed.success) return c.body(null, 204); // never fail the client

  const ownerUserId = await lookupArtifactOwner(
    parsed.data.artifactKind,
    parsed.data.artifactId,
  );

  await recordArtifactView({
    artifactKind: parsed.data.artifactKind,
    artifactId: parsed.data.artifactId,
    ownerUserId,
    viewerId: (c.var as any).user?.sub ?? null,
    viewerEmail: parsed.data.viewerEmail ?? null,
    viewerCompany: parsed.data.viewerCompany ?? null,
    ipHash: hashClientIp(c),
    ipCountry: ipCountryFromCtx(c),
    referrer: parsed.data.referrer ?? c.req.header("referer") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    engagement: parsed.data.engagement ?? null,
    engagementUnit: parsed.data.artifactKind === "video" ? "s" : "%",
    totalEngagementSec: parsed.data.totalEngagementSec ?? 0,
    percentConsumed: parsed.data.percentConsumed ?? 0,
    dropOffBucket: parsed.data.dropOffBucket ?? null,
  });

  return c.body(null, 204);
});

// GET /api/analytics/artifacts/:kind/:id — kind-aware analytics rollup.
// Returns the shared ArtifactMetrics shape (totalViews, heatmap, geo,
// referrers, viewers, ctaClicks). Owner-gated: only the artifact's
// owner (or a super-admin) can read aggregated viewer-level data.
analyticsRoutes.get("/artifacts/:kind/:id", async (c) => {
  const kindParam = c.req.param("kind");
  if (!(ARTIFACT_KINDS as readonly string[]).includes(kindParam)) {
    return c.json(error("INVALID_KIND", "Unknown artifact kind"), 400);
  }
  const kind = kindParam as ArtifactKind;
  const id = c.req.param("id");

  const uid = (c.var as any).user?.sub ?? null;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const ownerUserId = await lookupArtifactOwner(kind, id);
  // Owner-or-super-admin. Use the canonical predicate — the JWT payload
  // has no singular `role` field (it carries `roles[]` + `isSuperAdmin`),
  // so the old `user.role === "super_admin"` check silently never matched
  // and 403'd even genuine super-admins.
  if (!isSuperAdmin(c.var.user) && ownerUserId !== uid) {
    return c.json(error("FORBIDDEN", "Only the artifact owner can read stats"), 403);
  }

  const metrics = await getArtifactMetrics(kind, id);
  return c.json(success(metrics), 200);
});

// GET /api/analytics/creator/me — cross-artifact rollup for the unified
// creator dashboard (#1019 L5). Returns top-line totals + per-artifact
// summary rows for everything the authed user owns.
analyticsRoutes.get("/creator/me", async (c) => {
  const uid = (c.var as any).user?.sub ?? null;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const { buildCreatorRollup } = await import(
    "../services/analytics/creatorRollup.js"
  );
  const rollup = await buildCreatorRollup(uid);
  return c.json(success(rollup), 200);
});
