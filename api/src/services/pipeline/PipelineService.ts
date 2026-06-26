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
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import {
  PIPELINE_STAGES,
  maskConfidentialCandidate,
  type PipelineStage,
  type PipelineTouchpointType,
} from "../../../../shared/recruiter-pipeline.js";

/** Resolve which of the given candidate userIds are in confidential search
 *  mode (#1679). Used by every pipeline read surface (recruiter kanban +
 *  hiring-manager share portal) to mask identity until shortlist. Exported
 *  so both surfaces share one query — no drift. */
export async function confidentialCandidateIds(userIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return new Set();
  const rows = await getDb()
    .select({ userId: schema.userProfiles.userId })
    .from(schema.userProfiles)
    .where(and(inArray(schema.userProfiles.userId, ids), eq(schema.userProfiles.confidentialMode, true)));
  return new Set(rows.map((r: { userId: string }) => r.userId));
}

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
  const raw = await db
    .select()
    .from(schema.jobPipelineEntries)
    .where(eq(schema.jobPipelineEntries.jobId, jobId))
    .orderBy(desc(schema.jobPipelineEntries.stageChangedAt));

  // Confidential-applicant masking (#1679): a candidate in confidential
  // search mode stays anonymous to the employer until advanced to the
  // shortlist stage. Redaction happens HERE at the read boundary, never
  // in storage, so the underlying identity is preserved for the reveal.
  const confidential = await confidentialCandidateIds(
    raw.map((r: any) => r.candidateUserId).filter(Boolean) as string[],
  );
  const rows = raw.map((row: any) =>
    maskConfidentialCandidate(row, {
      isConfidential: !!row.candidateUserId && confidential.has(row.candidateUserId),
      stage: (row.stage as PipelineStage) ?? "applied",
    }),
  );

  const grouped: Record<PipelineStage, typeof rows> = Object.fromEntries(
    PIPELINE_STAGES.map((s) => [s, [] as typeof rows]),
  ) as Record<PipelineStage, typeof rows>;
  for (const row of rows) {
    const stage = (row.stage as PipelineStage) ?? "applied";
    if (grouped[stage]) grouped[stage].push(row);
  }
  return { rows, grouped };
}

/**
 * Cross-job aggregate read (#405) — every pipeline entry across the jobs the
 * recruiter can manage, grouped by stage, with each entry stamped with its
 * job title so the UI can label "for [Job Name]". Powers the cross-job
 * kanban that Loxo / Bullhorn / Greenhouse expose; the per-job
 * `listEntriesByStage` stays the single-job surface.
 *
 * `jobIds` is the viewer's already-resolved manageable set (see
 * `resolveManageableJobIds`) — the row-level tenancy filter. Optional
 * `stage` / `jobId` narrow the result; `jobId` is intersected with the
 * scope so it can never widen access. The same confidential-applicant
 * masking (#1679) as the per-job read is applied at this boundary.
 */
export async function listCrossJobEntriesByStage(
  jobIds: string[],
  filters: { stage?: PipelineStage; jobId?: string } = {},
) {
  const emptyGrouped = () =>
    Object.fromEntries(PIPELINE_STAGES.map((s) => [s, [] as any[]])) as Record<PipelineStage, any[]>;
  if (jobIds.length === 0) {
    return { rows: [] as any[], grouped: emptyGrouped(), jobs: [] as { id: string; title: string }[] };
  }

  const db = getDb();

  // Job-filter dropdown: every in-scope job that has ≥1 pipeline entry,
  // computed from the FULL scope (not the stage/job filter) so changing the
  // filter never empties the dropdown.
  const jobRows = await db
    .selectDistinct({ id: schema.jobItems.id, title: schema.jobItems.title })
    .from(schema.jobPipelineEntries)
    .innerJoin(schema.jobItems, eq(schema.jobPipelineEntries.jobId, schema.jobItems.id))
    .where(inArray(schema.jobPipelineEntries.jobId, jobIds));
  const jobs = jobRows
    .map((r: { id: string; title: string }) => ({ id: r.id, title: r.title }))
    .sort((a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title));

  // A jobId filter is intersected with the scope — out-of-scope ids resolve
  // to an empty entry set (never an access widen).
  const scopedIds = filters.jobId
    ? jobIds.includes(filters.jobId)
      ? [filters.jobId]
      : []
    : jobIds;
  if (scopedIds.length === 0) {
    return { rows: [] as any[], grouped: emptyGrouped(), jobs };
  }

  const where = filters.stage
    ? and(
        inArray(schema.jobPipelineEntries.jobId, scopedIds),
        eq(schema.jobPipelineEntries.stage, filters.stage),
      )
    : inArray(schema.jobPipelineEntries.jobId, scopedIds);

  const raw = await db
    .select({ entry: schema.jobPipelineEntries, jobTitle: schema.jobItems.title })
    .from(schema.jobPipelineEntries)
    .innerJoin(schema.jobItems, eq(schema.jobPipelineEntries.jobId, schema.jobItems.id))
    .where(where)
    .orderBy(desc(schema.jobPipelineEntries.stageChangedAt));

  const confidential = await confidentialCandidateIds(
    raw.map((r: any) => r.entry.candidateUserId).filter(Boolean) as string[],
  );
  const rows = raw.map((r: any) => ({
    ...maskConfidentialCandidate(r.entry, {
      isConfidential: !!r.entry.candidateUserId && confidential.has(r.entry.candidateUserId),
      stage: (r.entry.stage as PipelineStage) ?? "applied",
    }),
    jobTitle: r.jobTitle,
  }));

  const grouped = emptyGrouped() as Record<PipelineStage, typeof rows>;
  for (const row of rows) {
    const stage = (row.stage as PipelineStage) ?? "applied";
    if (grouped[stage]) grouped[stage].push(row);
  }

  return { rows, grouped, jobs };
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
