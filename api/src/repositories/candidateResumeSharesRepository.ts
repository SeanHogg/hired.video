/**
 * CandidateResumeSharesRepository — tokenized public share links of a
 * redacted + branded candidate résumé (gap #99). Thin wrapper over
 * shareLinksRepository (`share_links`, subject_type 'candidate_resume',
 * subject = the candidate résumé) that keeps the legacy row shape the
 * /api/recruit/shares API returns.
 */
import * as shareLinks from "./shareLinksRepository.js";
import type { ShareLinkPatch, ShareLinkRow } from "./shareLinksRepository.js";

const KIND = "candidate_resume";

export interface CandidateResumeShareRow {
  id: string;
  companyId: string;
  candidateResumeId: string;
  redactionProfileId: string | null;
  whitelabelTenantId: string | null;
  sharedByUserId: string | null;
  shareToken: string;
  name: string | null;
  recipientEmail: string | null;
  expiresAt: Date | null;
  isActive: boolean;
  viewCount: number;
  lastViewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CandidateResumeShareInsert {
  companyId: string;
  candidateResumeId: string;
  redactionProfileId: string | null;
  whitelabelTenantId: string | null;
  sharedByUserId: string;
  shareToken: string;
  name: string | null;
  recipientEmail: string | null;
  expiresAt: Date | null;
}

export type CandidateResumeSharePatch = Partial<
  Pick<CandidateResumeShareRow, "name" | "recipientEmail" | "expiresAt" | "isActive">
>;

function toShare(row: ShareLinkRow): CandidateResumeShareRow {
  return {
    id: row.id,
    companyId: row.companyId,
    candidateResumeId: row.subjectId,
    redactionProfileId: row.redactionProfileId,
    whitelabelTenantId: row.whitelabelTenantId,
    sharedByUserId: row.createdBy,
    shareToken: row.shareToken,
    name: row.label,
    recipientEmail: row.recipientEmail,
    expiresAt: row.expiresAt,
    isActive: row.revokedAt === null,
    viewCount: row.viewCount,
    lastViewedAt: row.lastViewedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const toShareOrNull = (row: ShareLinkRow | null) => (row ? toShare(row) : null);

/** Shares of the given companies (optionally one résumé), newest first. */
export async function listCandidateResumeShares(filter: {
  companyIds: string[];
  candidateResumeId?: string;
}): Promise<CandidateResumeShareRow[]> {
  const rows = await shareLinks.listShareLinks(KIND, {
    companyIds: filter.companyIds,
    subjectId: filter.candidateResumeId,
  });
  return rows.map(toShare);
}

export async function findCandidateResumeShareById(id: string): Promise<CandidateResumeShareRow | null> {
  return toShareOrNull(await shareLinks.findShareLinkById(KIND, id));
}

export async function findCandidateResumeShareByToken(token: string): Promise<CandidateResumeShareRow | null> {
  return toShareOrNull(await shareLinks.findShareLinkByToken(KIND, token));
}

export async function insertCandidateResumeShare(
  values: CandidateResumeShareInsert,
): Promise<CandidateResumeShareRow> {
  return toShare(
    await shareLinks.insertShareLink(KIND, {
      subjectId: values.candidateResumeId,
      companyId: values.companyId,
      redactionProfileId: values.redactionProfileId,
      whitelabelTenantId: values.whitelabelTenantId,
      createdBy: values.sharedByUserId,
      shareToken: values.shareToken,
      label: values.name,
      recipientEmail: values.recipientEmail,
      expiresAt: values.expiresAt,
    }),
  );
}

/** Legacy `isActive` / `name` patch → share_links columns. */
function toShareLinkPatch(patch: CandidateResumeSharePatch): ShareLinkPatch {
  const out: ShareLinkPatch = {};
  if (patch.name !== undefined) out.label = patch.name;
  if (patch.recipientEmail !== undefined) out.recipientEmail = patch.recipientEmail;
  if (patch.expiresAt !== undefined) out.expiresAt = patch.expiresAt;
  if (patch.isActive !== undefined) out.revokedAt = shareLinks.revokedAtFor(patch.isActive);
  return out;
}

export async function updateCandidateResumeShare(
  id: string,
  patch: CandidateResumeSharePatch,
): Promise<CandidateResumeShareRow | null> {
  return toShareOrNull(await shareLinks.updateShareLink(KIND, id, toShareLinkPatch(patch)));
}

export async function deleteCandidateResumeShare(id: string): Promise<void> {
  await shareLinks.deleteShareLink(KIND, id);
}

/** Record one public view. */
export async function recordCandidateResumeShareView(id: string): Promise<void> {
  await shareLinks.recordShareLinkView(id);
}
