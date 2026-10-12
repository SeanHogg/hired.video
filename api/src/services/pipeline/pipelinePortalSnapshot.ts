/**
 * Hiring-manager share portal snapshot (#1679 / #2133) — the redacted,
 * read-only kanban served at `GET /api/pipeline/public/:shareToken`.
 *
 * Same read rules as the recruiter kanban: every row goes through
 * `toPipelineCandidateDto`, so a confidential candidate's identity AND video
 * pitch stay hidden until shortlist. Pitches + confidential flags are
 * batch-loaded once for the whole page via `candidateSignals` (no N+1).
 *
 * Contact PII (email / phone / LinkedIn / résumé URL) is never selected.
 */
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  type PipelineStage,
} from "../../../../shared/recruiter-pipeline.js";
import { candidateSignals, toPipelineCandidateDto, type CandidateSignals } from "./PipelineService.js";

/** The portal's narrow row shape — no contact PII. */
export interface PortalEntryRow {
  id: string;
  stage: string | null;
  candidateUserId: string | null;
  candidateName: string | null;
  candidateLocation: string | null;
  candidateAvatarUrl: string | null;
  tags: string[] | null;
  stageChangedAt: Date | string | null;
  addedFrom: string | null;
}

/** Pure: raw portal rows → per-stage redacted columns. */
export function toPortalStages(rows: PortalEntryRow[], signals: CandidateSignals) {
  const entries = rows.map((row) => toPipelineCandidateDto(row, signals));
  const grouped = Object.fromEntries(
    PIPELINE_STAGES.map((s) => [s, [] as typeof entries]),
  ) as Record<PipelineStage, typeof entries>;
  for (const e of entries) {
    const s = ((e.stage as PipelineStage) ?? "applied");
    if (grouped[s]) grouped[s].push(e);
  }
  return {
    stages: PIPELINE_STAGES.map((stage) => ({
      stage,
      label: PIPELINE_STAGE_LABELS[stage],
      entries: grouped[stage],
      count: grouped[stage].length,
    })),
    total: entries.length,
  };
}

/** Load + redact the portal columns for one job. Three queries total:
 *  entries, then confidential flags and pitches in parallel. */
export async function loadPortalStages(jobId: string) {
  const rows = (await getDb()
    .select({
      id: schema.jobPipelineEntries.id,
      stage: schema.jobPipelineEntries.stage,
      candidateUserId: schema.jobPipelineEntries.candidateUserId,
      candidateName: schema.jobPipelineEntries.candidateName,
      candidateLocation: schema.jobPipelineEntries.candidateLocation,
      candidateAvatarUrl: schema.jobPipelineEntries.candidateAvatarUrl,
      tags: schema.jobPipelineEntries.tags,
      stageChangedAt: schema.jobPipelineEntries.stageChangedAt,
      addedFrom: schema.jobPipelineEntries.addedFrom,
    })
    .from(schema.jobPipelineEntries)
    .where(eq(schema.jobPipelineEntries.jobId, jobId))
    .orderBy(desc(schema.jobPipelineEntries.stageChangedAt))) as PortalEntryRow[];

  const signals = await candidateSignals(
    rows.map((r) => r.candidateUserId).filter((id): id is string => !!id),
  );
  return toPortalStages(rows, signals);
}
