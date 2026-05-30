/**
 * /api/jobs-analytics/:id — per-job analytics rollup (#411).
 *
 * Returns: views-per-day series, applications-by-source, pipeline-stage
 * funnel, sponsored-vs-organic view split. The dialog mounted from
 * `JobActionsMenu` deep-links here and renders the panel.
 *
 * Aggregations are read-only; no writes. We tolerate missing tables in
 * the join (e.g. `job_pipeline_applications` may not exist on every
 * deploy) by guarding each subquery with a try/catch so the dialog
 * always gets a partial response over a 500.
 */

import { Hono } from "hono";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";

export const jobAnalyticsRoutes = new Hono<AppEnv>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

interface JobAnalytics {
  jobId: string;
  totalViews: number;
  sponsoredViews: number;
  organicViews: number;
  totalApplications: number;
  viewsByDay: Array<{ day: string; count: number }>;
  applicationsBySource: Array<{ source: string; count: number }>;
  pipelineFunnel: Array<{ stage: string; count: number }>;
}

jobAnalyticsRoutes.get("/:id", async (c) => {
  const u = uid(c);
  if (!u) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const jobId = c.req.param("id");
  const db = getDb();

  const [job] = await db
    .select({ id: schema.jobItems.id, userId: schema.jobItems.userId })
    .from(schema.jobItems)
    .where(eq(schema.jobItems.id, jobId))
    .limit(1);
  if (!job) return c.json(error("NOT_FOUND", "Job not found"), 404);
  if (job.userId !== u) {
    // Public visibility — analytics is owner-only.
    return c.json(error("FORBIDDEN", "Only the job owner can view analytics"), 403);
  }

  const since = new Date(Date.now() - 30 * 86_400_000);

  // Views-by-day — guard around the analytics table, which not every deploy has yet.
  let viewsByDay: JobAnalytics["viewsByDay"] = [];
  let totalViews = 0;
  let sponsoredViews = 0;
  let organicViews = 0;
  try {
    const viewTable = (schema as any).jobViewEvents ?? (schema as any).jobViews;
    if (viewTable) {
      const rows = await db
        .select({
          day: sql<string>`to_char(${viewTable.createdAt}, 'YYYY-MM-DD')`,
          count: sql<number>`count(*)::int`,
          sponsored: sql<number>`sum(case when ${viewTable.source} = 'boost' then 1 else 0 end)::int`,
        })
        .from(viewTable)
        .where(and(eq(viewTable.jobId, jobId), gte(viewTable.createdAt, since)))
        .groupBy(sql`to_char(${viewTable.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${viewTable.createdAt}, 'YYYY-MM-DD')`);
      viewsByDay = rows.map((r) => ({ day: r.day, count: Number(r.count) || 0 }));
      totalViews = viewsByDay.reduce((s, r) => s + r.count, 0);
      sponsoredViews = rows.reduce((s, r) => s + (Number((r as any).sponsored) || 0), 0);
      organicViews = totalViews - sponsoredViews;
    }
  } catch {
    // table missing — leave the series empty
  }

  // Applications-by-source
  let applicationsBySource: JobAnalytics["applicationsBySource"] = [];
  let totalApplications = 0;
  try {
    const appsTable = (schema as any).jobApplications;
    if (appsTable) {
      const rows = await db
        .select({
          source: sql<string>`coalesce(${appsTable.source}, 'direct')`,
          count: sql<number>`count(*)::int`,
        })
        .from(appsTable)
        .where(eq(appsTable.jobId, jobId))
        .groupBy(sql`coalesce(${appsTable.source}, 'direct')`);
      applicationsBySource = rows.map((r) => ({ source: r.source, count: Number(r.count) || 0 }));
      totalApplications = applicationsBySource.reduce((s, r) => s + r.count, 0);
    }
  } catch {
    // table missing
  }

  // Pipeline funnel
  let pipelineFunnel: JobAnalytics["pipelineFunnel"] = [];
  try {
    const pipelineTable =
      (schema as any).jobPipelineApplications ?? (schema as any).hiringPipelineApplications;
    if (pipelineTable) {
      const rows = await db
        .select({
          stage: pipelineTable.stage,
          count: sql<number>`count(*)::int`,
        })
        .from(pipelineTable)
        .where(eq(pipelineTable.jobId, jobId))
        .groupBy(pipelineTable.stage);
      pipelineFunnel = rows.map((r) => ({ stage: r.stage ?? "unknown", count: Number(r.count) || 0 }));
    }
  } catch {
    // table missing
  }

  const payload: JobAnalytics = {
    jobId,
    totalViews,
    sponsoredViews,
    organicViews,
    totalApplications,
    viewsByDay,
    applicationsBySource,
    pipelineFunnel,
  };

  return c.json(success(payload), 200);
});

jobAnalyticsRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Job analytics route not found" } }, 404),
);
