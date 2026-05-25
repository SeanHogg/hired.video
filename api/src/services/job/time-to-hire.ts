/**
 * Time-to-hire — computed metric for a job from its pipeline history.
 *
 * Definition: per-candidate "days from added-to-pipeline to stage='hired'",
 * averaged across every candidate of the job that reached the hired
 * terminal stage. Returns null when no hires have happened yet so the
 * UI can render a "Not enough data" pill instead of a misleading zero.
 *
 * Pure-ish: takes a jobId, runs one SELECT, returns the metric. No LLM,
 * no caching layer — the recruiter-facing detail page only renders this
 * once per page-view and the per-job pipeline is small enough that an
 * indexed scan is fast.
 */

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";

export interface TimeToHireMetric {
  /** Average days-from-added-to-hired across all hired pipeline rows. */
  averageDays: number | null;
  /** Median is more resilient to a single outlier hire. */
  medianDays: number | null;
  /** How many hired-stage rows backed the calculation. */
  sampleSize: number;
  /** Optional fastest / slowest for a percentile feel. */
  fastestDays: number | null;
  slowestDays: number | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export async function computeTimeToHire(jobId: string): Promise<TimeToHireMetric> {
  const db = getDb();
  const pipelineTable = (schema as any).jobPipelineEntries;
  if (!pipelineTable) {
    return { averageDays: null, medianDays: null, sampleSize: 0, fastestDays: null, slowestDays: null };
  }
  const rows = await db
    .select({
      createdAt: pipelineTable.createdAt,
      stageChangedAt: pipelineTable.stageChangedAt,
    })
    .from(pipelineTable)
    .where(and(eq(pipelineTable.jobId, jobId), eq(pipelineTable.stage, "hired")))
    .catch(() => [] as { createdAt: Date; stageChangedAt: Date }[]);

  if (rows.length === 0) {
    return { averageDays: null, medianDays: null, sampleSize: 0, fastestDays: null, slowestDays: null };
  }

  const durations: number[] = [];
  for (const r of rows as any[]) {
    const created = r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt);
    const hired = r.stageChangedAt instanceof Date ? r.stageChangedAt : new Date(r.stageChangedAt);
    const ms = hired.getTime() - created.getTime();
    if (ms < 0) continue; // tolerate clock skew / data import inversions
    durations.push(ms / MS_PER_DAY);
  }
  if (durations.length === 0) {
    return { averageDays: null, medianDays: null, sampleSize: 0, fastestDays: null, slowestDays: null };
  }
  durations.sort((a, b) => a - b);
  const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
  return {
    averageDays: Number(avg.toFixed(1)),
    medianDays: Number(median(durations).toFixed(1)),
    sampleSize: durations.length,
    fastestDays: Number(durations[0].toFixed(1)),
    slowestDays: Number(durations[durations.length - 1].toFixed(1)),
  };
}
