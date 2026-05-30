/**
 * /api/artifact-metrics — Job + Company per-view metrics (#863).
 *
 *   POST /track/job/:id           record a view event (geo via cf-ipcountry)
 *   POST /track/company/:id       same for companies
 *   GET  /job/:id                 owner-only aggregate
 *   GET  /company/:id             owner-only aggregate
 *
 * Mirrors the resume metrics surface already shipped under #862; reuses
 * the same `ArtifactMetrics` shape so the recruiter dashboard can mount
 * `<MetricsPanel kind="job">` next to the applicant funnel.
 */

import { Hono } from "hono";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { requireJobOwner } from "../services/jobs/jobOwnership.js";

export const artifactMetricsRoutes = new Hono<AppEnv>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

function geoFromRequest(c: any): { country: string | null; region: string | null } {
  // Cloudflare Workers exposes cf-ipcountry on every request; non-Cloudflare
  // hosts get null and the metric simply doesn't carry geo.
  return {
    country: c.req.header("cf-ipcountry") ?? null,
    region: c.req.header("cf-region-code") ?? null,
  };
}

artifactMetricsRoutes.post("/track/job/:id", async (c) => {
  const u = uid(c);
  const { country, region } = geoFromRequest(c);
  const referrer = c.req.header("referer") ?? c.req.header("referrer") ?? null;
  const source = (c.req.query("source") ?? "organic").slice(0, 32);
  const userAgent = c.req.header("user-agent")?.slice(0, 512) ?? null;
  const db = getDb();
  await db.insert(schema.jobViewEvents).values({
    jobId: c.req.param("id"),
    viewerUserId: u,
    countryCode: country,
    region,
    referrer,
    source,
    userAgent,
  } as never);
  return c.json(success({ recorded: true }), 201);
});

artifactMetricsRoutes.post("/track/company/:id", async (c) => {
  const u = uid(c);
  const { country, region } = geoFromRequest(c);
  const referrer = c.req.header("referer") ?? c.req.header("referrer") ?? null;
  const source = (c.req.query("source") ?? "organic").slice(0, 32);
  const userAgent = c.req.header("user-agent")?.slice(0, 512) ?? null;
  const db = getDb();
  await db.insert(schema.companyViewEvents).values({
    companyId: c.req.param("id"),
    viewerUserId: u,
    countryCode: country,
    region,
    referrer,
    source,
    userAgent,
  } as never);
  return c.json(success({ recorded: true }), 201);
});

interface ArtifactMetrics {
  entityId: string;
  totalViews: number;
  uniqueViewers: number;
  byCountry: Array<{ country: string; count: number }>;
  byReferrer: Array<{ referrer: string; count: number }>;
  bySource: Array<{ source: string; count: number }>;
  byDay: Array<{ day: string; count: number }>;
}

async function aggregateViews(args: {
  table: any;
  entityCol: any;
  entityId: string;
}): Promise<ArtifactMetrics> {
  const db = getDb();
  const since = new Date(Date.now() - 30 * 86_400_000);
  const where = and(eq(args.entityCol, args.entityId), gte(args.table.createdAt, since));

  const [totalsRow] = await db
    .select({
      total: sql<number>`count(*)::int`,
      unique: sql<number>`count(distinct ${args.table.viewerUserId})::int`,
    })
    .from(args.table)
    .where(where);
  const byCountry = await db
    .select({
      country: sql<string>`coalesce(${args.table.countryCode}, 'unknown')`,
      count: sql<number>`count(*)::int`,
    })
    .from(args.table)
    .where(where)
    .groupBy(sql`coalesce(${args.table.countryCode}, 'unknown')`)
    .orderBy(desc(sql`count(*)`))
    .limit(20);
  const byReferrer = await db
    .select({
      referrer: sql<string>`coalesce(${args.table.referrer}, 'direct')`,
      count: sql<number>`count(*)::int`,
    })
    .from(args.table)
    .where(where)
    .groupBy(sql`coalesce(${args.table.referrer}, 'direct')`)
    .orderBy(desc(sql`count(*)`))
    .limit(20);
  const bySource = await db
    .select({
      source: sql<string>`coalesce(${args.table.source}, 'organic')`,
      count: sql<number>`count(*)::int`,
    })
    .from(args.table)
    .where(where)
    .groupBy(sql`coalesce(${args.table.source}, 'organic')`);
  const byDay = await db
    .select({
      day: sql<string>`to_char(${args.table.createdAt}, 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    })
    .from(args.table)
    .where(where)
    .groupBy(sql`to_char(${args.table.createdAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${args.table.createdAt}, 'YYYY-MM-DD')`);

  return {
    entityId: args.entityId,
    totalViews: Number(totalsRow?.total) || 0,
    uniqueViewers: Number(totalsRow?.unique) || 0,
    byCountry: byCountry.map((r) => ({ country: r.country, count: Number(r.count) || 0 })),
    byReferrer: byReferrer.map((r) => ({ referrer: r.referrer, count: Number(r.count) || 0 })),
    bySource: bySource.map((r) => ({ source: r.source, count: Number(r.count) || 0 })),
    byDay: byDay.map((r) => ({ day: r.day, count: Number(r.count) || 0 })),
  };
}

artifactMetricsRoutes.get("/job/:id", async (c) => {
  const jobId = c.req.param("id");
  // Per the DRY rule + project_jobs ownership invariant (#438): every
  // job-management route goes through `requireJobOwner` — it owns the
  // super-admin + posted-by + company-team-member rules in one place.
  // The previous inline `userId` check was reading a non-existent
  // column (`job_items.user_id` doesn't exist; the field is
  // `postedByUserId`) AND silently denied legitimate company team
  // members + super-admins.
  const { denied } = await requireJobOwner(c, jobId);
  if (denied) return denied;
  const metrics = await aggregateViews({
    table: schema.jobViewEvents,
    entityCol: schema.jobViewEvents.jobId,
    entityId: jobId,
  });
  return c.json(success(metrics), 200);
});

artifactMetricsRoutes.get("/company/:id", async (c) => {
  const u = uid(c);
  if (!u) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [company] = await db
    .select({ id: schema.companyProfiles.id, ownerId: schema.companyProfiles.ownerId })
    .from(schema.companyProfiles)
    .where(eq(schema.companyProfiles.id, c.req.param("id")))
    .limit(1);
  if (!company) return c.json(error("NOT_FOUND", "Company not found"), 404);
  if (company.ownerId !== u) return c.json(error("FORBIDDEN", "Owner only"), 403);
  const metrics = await aggregateViews({
    table: schema.companyViewEvents,
    entityCol: schema.companyViewEvents.companyId,
    entityId: company.id,
  });
  return c.json(success(metrics), 200);
});

artifactMetricsRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Artifact metrics route not found" } }, 404),
);
