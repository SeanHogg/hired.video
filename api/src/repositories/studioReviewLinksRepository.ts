/**
 * StudioReviewLinksRepository — public review links for a studio project
 * (gap #145). Thin wrapper over shareLinksRepository (`share_links`,
 * subject_type 'studio_review', subject = the project) keeping the legacy
 * studio_review_links row shape the /api/studio review-link API returns.
 */
import * as shareLinks from "./shareLinksRepository.js";
import type { ShareLinkRow } from "./shareLinksRepository.js";

const KIND = "studio_review";

export interface StudioReviewLinkRow {
  id: string;
  projectId: string;
  /** Who minted the link (null once that account is deleted). */
  userId: string | null;
  shareToken: string;
  name: string | null;
  expiresAt: Date | null;
  isActive: boolean;
  createdAt: Date;
}

function toReviewLink(row: ShareLinkRow): StudioReviewLinkRow {
  return {
    id: row.id,
    projectId: row.subjectId,
    userId: row.createdBy,
    shareToken: row.shareToken,
    name: row.label,
    expiresAt: row.expiresAt,
    isActive: row.revokedAt === null,
    createdAt: row.createdAt,
  };
}

export async function insertStudioReviewLink(values: {
  projectId: string;
  userId: string;
  shareToken: string;
  name: string;
  expiresAt: Date | null;
}): Promise<StudioReviewLinkRow> {
  return toReviewLink(
    await shareLinks.insertShareLink(KIND, {
      subjectId: values.projectId,
      createdBy: values.userId,
      shareToken: values.shareToken,
      label: values.name,
      expiresAt: values.expiresAt,
    }),
  );
}

/** Every link on the project, newest first. */
export async function listStudioReviewLinks(projectId: string): Promise<StudioReviewLinkRow[]> {
  return (await shareLinks.listShareLinks(KIND, { subjectId: projectId })).map(toReviewLink);
}

/** The link behind a public token, only while it is active (not revoked).
 *  Expiry is the caller's check (it answers 410, not 404). */
export async function findActiveStudioReviewLinkByToken(token: string): Promise<StudioReviewLinkRow | null> {
  const row = await shareLinks.findShareLinkByToken(KIND, token);
  return row && row.revokedAt === null ? toReviewLink(row) : null;
}

export async function deleteStudioReviewLink(id: string): Promise<string | null> {
  return shareLinks.deleteShareLink(KIND, id);
}
