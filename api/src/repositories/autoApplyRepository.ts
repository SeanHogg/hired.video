/**
 * Auto-apply persistence (#77) — records the applications the agent submits
 * after its LLM tailoring loop in ONE multi-row insert (was one insert per job
 * inside the loop).
 *
 * Per-job failure semantics are preserved: if the batch fails (one bad row
 * aborts a multi-row insert), we fall back to per-row inserts on that error
 * path only, so each job independently resolves to applied (id) or skipped.
 */
import { schema, type Db } from "../db/index.js";

const { jobApplications } = schema;

export interface AutoApplyDraft {
  jobId: string;
  coverLetter: string;
}

/** Insert an `applied` application per draft. Returns jobId → applicationId
 *  for every row that was written; jobs absent from the map were skipped. */
export async function insertAutoApplications(
  db: Db,
  userId: string,
  resumeId: string | null,
  drafts: readonly AutoApplyDraft[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (drafts.length === 0) return out;
  const appliedAt = new Date();
  const toRow = (d: AutoApplyDraft) => ({
    userId,
    jobId: d.jobId,
    resumeId,
    coverLetter: d.coverLetter,
    status: "applied",
    appliedAt,
  });

  try {
    const rows = await db
      .insert(jobApplications)
      .values(drafts.map(toRow))
      .returning({ id: jobApplications.id, jobId: jobApplications.jobId });
    for (const r of rows) if (r.jobId) out.set(r.jobId, r.id);
    return out;
  } catch {
    // Fall through to per-row so one failing job doesn't skip the others.
  }

  for (const d of drafts) {
    try {
      const [row] = await db
        .insert(jobApplications)
        .values(toRow(d))
        .returning({ id: jobApplications.id });
      if (row) out.set(d.jobId, row.id);
    } catch { /* this job is skipped */ }
  }
  return out;
}
