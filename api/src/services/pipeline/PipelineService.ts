/**
 * PipelineService — domain-layer operations on the candidate pipeline for one
 * job. Routes call into this so they stay transport-only; tests can drive the
 * service directly without HTTP.
 *
 * Encapsulates:
 *   - touchpoint emission (single helper used by every state-changing op)
 *   - stage-change side effects (rejection metadata, touchpoint type swap)
 *   - aggregate read (entries grouped by stage)
 *   - report rollup (per-stage counts + avg days-in-stage)
 *
 * Share links are a sibling aggregate — see PipelineShareService.
 */
import { and, count, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import {
  PIPELINE_STAGES,
  type PipelineStage,
  type PipelineTouchpointType,
} from "../../../../shared/recruiter-pipeline.js";

export async function logTouchpoint(input: {
  entryId: string;
  type: PipelineTouchpointType;
  payload?: Record<string, unknown>;
  performedByUserId: string | null;
}): Promise<void> {
  const db = getDb();
  await db.insert(schema.pipelineTouchpoints).values({
    entryId: input.entryId,
    type: input.type,
    payload: input.payload ?? {},
    performedByUserId: input.performedByUserId,
  } as typeof schema.pipelineTouchpoints.$inferInsert);
}

export async function listEntriesByStage(jobId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.jobPipelineEntries)
    .where(eq(schema.jobPipelineEntries.jobId, jobId))
    .orderBy(desc(schema.jobPipelineEntries.stageChangedAt));

  const grouped: Record<PipelineStage, typeof rows> = Object.fromEntries(
    PIPELINE_STAGES.map((s) => [s, [] as typeof rows]),
  ) as Record<PipelineStage, typeof rows>;
  for (const row of rows) {
    const stage = (row.stage as PipelineStage) ?? "applied";
    if (grouped[stage]) grouped[stage].push(row);
  }
  return { rows, grouped };
}

export async function moveStage(input: {
  jobId: string;
  entryId: string;
  toStage: PipelineStage;
  rejectionReason?: string | null;
  performedByUserId: string;
}) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(schema.jobPipelineEntries)
    .where(
      and(
        eq(schema.jobPipelineEntries.id, input.entryId),
        eq(schema.jobPipelineEntries.jobId, input.jobId),
      ),
    )
    .limit(1);
  if (!existing) return { updated: null, found: false };

  const now = new Date();
  const isReject = input.toStage === "rejected";
  const [updated] = await db
    .update(schema.jobPipelineEntries)
    .set({
      stage: input.toStage,
      stageChangedAt: now,
      updatedAt: now,
      rejectedAt: isReject ? now : existing.rejectedAt,
      rejectionReason: isReject ? input.rejectionReason ?? null : existing.rejectionReason,
    } as Partial<typeof schema.jobPipelineEntries.$inferInsert>)
    .where(eq(schema.jobPipelineEntries.id, input.entryId))
    .returning();

  await logTouchpoint({
    entryId: input.entryId,
    type: isReject ? "rejected" : "stage_change",
    payload: {
      from: existing.stage,
      to: input.toStage,
      ...(isReject && input.rejectionReason ? { reason: input.rejectionReason } : {}),
    },
    performedByUserId: input.performedByUserId,
  });

  return { updated, found: true };
}

export async function buildReport(jobId: string) {
  const db = getDb();
  const stageCountsRaw = await db
    .select({ stage: schema.jobPipelineEntries.stage, n: count() })
    .from(schema.jobPipelineEntries)
    .where(eq(schema.jobPipelineEntries.jobId, jobId))
    .groupBy(schema.jobPipelineEntries.stage);

  const byStage: Record<string, number> = {};
  for (const row of stageCountsRaw) byStage[row.stage as string] = Number(row.n);

  const avgDaysRaw = await db
    .select({
      stage: schema.jobPipelineEntries.stage,
      avgDays: sql<number>`AVG(EXTRACT(EPOCH FROM (NOW() - ${schema.jobPipelineEntries.stageChangedAt})) / 86400)`,
    })
    .from(schema.jobPipelineEntries)
    .where(eq(schema.jobPipelineEntries.jobId, jobId))
    .groupBy(schema.jobPipelineEntries.stage);

  const avgDaysByStage: Record<string, number> = {};
  for (const row of avgDaysRaw) avgDaysByStage[row.stage as string] = Number(row.avgDays ?? 0);

  const total = Object.values(byStage).reduce((a, b) => a + b, 0);
  const rejected = byStage["rejected"] ?? 0;
  const hired = byStage["hired"] ?? 0;
  const active = total - rejected - hired;

  return {
    total,
    active,
    rejected,
    hired,
    stages: PIPELINE_STAGES.map((stage) => ({
      stage,
      count: byStage[stage] ?? 0,
      avgDaysInStage: Number((avgDaysByStage[stage] ?? 0).toFixed(1)),
    })),
  };
}
