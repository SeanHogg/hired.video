/**
 * Hiring-insights routes — the employer-facing read-only feed that powers
 * the DEI / hiring-equity panel on EmployerDashboard.
 *
 * `/api/recruiter/hiring-insights` returns the aggregate metrics we
 * can compute today from `job_pipeline_entries` without demographic
 * data (which we don't collect yet — see gap #1224). Surfaces:
 *   - org-level pipeline funnel (counts per terminal stage)
 *   - org-level time-to-hire (avg + median across hires this period)
 *   - source mix (where pipeline candidates came from)
 *
 * Manager-only — the recruiter must be the owner of at least one job
 * to see anything. Per-job metrics already live on /api/jobs/:id/metrics.
 */

import { Hono } from "hono";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Variables } from "../types/index.js";
import { error, success } from "../types/index.js";
import { getDb, schema } from "../db/index.js";

export const hiringInsightsRoutes = new Hono<{ Variables: Variables }>();

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

hiringInsightsRoutes.get("/", async (c) => {
  const uid = (c.var.user?.sub as string | undefined) ?? null;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const jobsTable = (schema as any).jobItems;
  const pipelineTable = (schema as any).jobPipelineEntries;
  if (!jobsTable || !pipelineTable) {
    return c.json(success({
      jobIds: [],
      pipelineFunnel: {},
      totalCandidates: 0,
      totalHires: 0,
      avgTimeToHireDays: null,
      medianTimeToHireDays: null,
      sourceMix: {},
      demographics: {
        supported: false,
        reason: "Demographic capture not yet enabled — see gap register entry #1231.",
      },
    }), 200);
  }

  // The recruiter's jobs (org scope = jobs they posted).
  const myJobs = await db
    .select({ id: jobsTable.id })
    .from(jobsTable)
    .where(eq(jobsTable.postedByUserId, uid))
    .catch(() => []);
  const jobIds = (myJobs as any[]).map((j) => j.id);
  if (jobIds.length === 0) {
    return c.json(success({
      jobIds: [],
      pipelineFunnel: {},
      totalCandidates: 0,
      totalHires: 0,
      avgTimeToHireDays: null,
      medianTimeToHireDays: null,
      sourceMix: {},
      demographics: {
        supported: false,
        reason: "Demographic capture not yet enabled — see gap register entry #1231.",
      },
    }), 200);
  }

  const rows = await db
    .select({
      stage: pipelineTable.stage,
      addedFrom: pipelineTable.addedFrom,
      createdAt: pipelineTable.createdAt,
      stageChangedAt: pipelineTable.stageChangedAt,
    })
    .from(pipelineTable)
    .where(inArray(pipelineTable.jobId, jobIds))
    .catch(() => []);

  const pipelineFunnel: Record<string, number> = {};
  const sourceMix: Record<string, number> = {};
  const hireDurationsDays: number[] = [];

  for (const r of rows as any[]) {
    pipelineFunnel[r.stage] = (pipelineFunnel[r.stage] ?? 0) + 1;
    if (r.addedFrom) sourceMix[r.addedFrom] = (sourceMix[r.addedFrom] ?? 0) + 1;
    if (r.stage === "hired" && r.createdAt && r.stageChangedAt) {
      const created = r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt);
      const hired = r.stageChangedAt instanceof Date ? r.stageChangedAt : new Date(r.stageChangedAt);
      const days = (hired.getTime() - created.getTime()) / MS_PER_DAY;
      if (days >= 0) hireDurationsDays.push(days);
    }
  }
  hireDurationsDays.sort((a, b) => a - b);
  const totalCandidates = rows.length;
  const totalHires = pipelineFunnel["hired"] ?? 0;
  const avg = hireDurationsDays.length
    ? hireDurationsDays.reduce((a, b) => a + b, 0) / hireDurationsDays.length
    : null;

  return c.json(success({
    jobIds,
    pipelineFunnel,
    totalCandidates,
    totalHires,
    avgTimeToHireDays: avg != null ? Number(avg.toFixed(1)) : null,
    medianTimeToHireDays: hireDurationsDays.length ? Number(median(hireDurationsDays).toFixed(1)) : null,
    sourceMix,
    demographics: {
      supported: false,
      reason: "Demographic capture not yet enabled — see gap register entry #1231.",
    },
  }), 200);
});
