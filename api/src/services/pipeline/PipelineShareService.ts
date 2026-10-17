/**
 * PipelineShareService — tokenised hiring-manager share links for one job's
 * kanban (sibling aggregate of the pipeline entries). Owners create / list /
 * revoke links; the public portal reads a redacted snapshot by token.
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { randomHex } from "../../utils/crypto.js";
import * as shareLinks from "../../repositories/shareLinksRepository.js";
import type { ShareLinkRow } from "../../repositories/shareLinksRepository.js";
import { loadPortalStages } from "./pipelinePortalSnapshot.js";

/** share_links kind for a job's kanban portal (subject = the job). */
const KIND = "pipeline_job";

/** The legacy pipeline_share_links row shape the API returns. */
export interface PipelineShareLinkRow {
  id: string;
  jobId: string;
  shareToken: string;
  label: string | null;
  expiresAt: Date | null;
  createdByUserId: string | null;
  createdAt: Date;
}

function toPipelineLink(row: ShareLinkRow): PipelineShareLinkRow {
  return {
    id: row.id,
    jobId: row.subjectId,
    shareToken: row.shareToken,
    label: row.label,
    expiresAt: row.expiresAt,
    createdByUserId: row.createdBy,
    createdAt: row.createdAt,
  };
}

export async function createShareLink(input: {
  jobId: string;
  label: string | null;
  expiresAt: Date | null;
  createdByUserId: string;
}): Promise<PipelineShareLinkRow> {
  const row = await shareLinks.insertShareLink(KIND, {
    subjectId: input.jobId,
    shareToken: randomHex(24),
    label: input.label,
    expiresAt: input.expiresAt,
    createdBy: input.createdByUserId,
  });
  return toPipelineLink(row);
}

export async function listShareLinks(jobId: string): Promise<PipelineShareLinkRow[]> {
  return (await shareLinks.listShareLinks(KIND, { subjectId: jobId })).map(toPipelineLink);
}

/** The job a link belongs to (null when missing) — for the owner gate. */
export async function getShareLinkJobId(linkId: string): Promise<string | null> {
  return (await shareLinks.findShareLinkById(KIND, linkId))?.subjectId ?? null;
}

export async function deleteShareLink(linkId: string): Promise<string | null> {
  return shareLinks.deleteShareLink(KIND, linkId);
}

export type PublicPortalResult =
  | { error: "NOT_FOUND" | "EXPIRED" | "JOB_NOT_FOUND" }
  | {
      job: { id: string; title: string; company: string | null };
      label: string | null;
      stages: Awaited<ReturnType<typeof loadPortalStages>>["stages"];
      total: number;
    };

/**
 * Public read — redacted snapshot (no email/phone) so hiring managers see
 * candidate progression (and revealed candidates' video pitches) without PII.
 * Same confidential redaction as the recruiter kanban (#1679 / #2133).
 */
export async function getPublicPortal(shareToken: string): Promise<PublicPortalResult> {
  const db = getDb();
  const row = await shareLinks.findShareLinkByToken(KIND, shareToken);
  if (!row) return { error: "NOT_FOUND" };
  const link = toPipelineLink(row);
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) return { error: "EXPIRED" };

  const [job] = await db
    .select({ id: schema.jobItems.id, title: schema.jobItems.title, company: schema.jobItems.company })
    .from(schema.jobItems)
    .where(eq(schema.jobItems.id, link.jobId))
    .limit(1);
  if (!job) return { error: "JOB_NOT_FOUND" };

  const { stages, total } = await loadPortalStages(link.jobId);
  return { job: { id: job.id, title: job.title, company: job.company }, label: link.label, stages, total };
}
