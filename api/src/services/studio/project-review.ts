/**
 * Studio review comments + public share-link review (#145). Access to the
 * team endpoints (who may act on the project / comment) is checked by the
 * caller; the public endpoints are gated by an active, unexpired review link.
 * SQL lives in repositories/studioReviewCommentsRepository.ts,
 * studioReviewLinksRepository.ts and studioProjectsRepository.ts.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { findProjectById } from "../../repositories/studioProjectsRepository.js";
import {
  deleteStudioReviewComment,
  insertStudioReviewComment,
  listStudioReviewComments,
  setStudioReviewCommentResolved,
  type StudioReviewCommentInsert,
  type StudioReviewCommentRow,
} from "../../repositories/studioReviewCommentsRepository.js";
import {
  findActiveStudioReviewLinkByToken,
  type StudioReviewLinkRow,
} from "../../repositories/studioReviewLinksRepository.js";

/** The active link behind `token`: 404 (`notFoundMessage`) when unknown or
 *  revoked, 410 EXPIRED once past its expiry. */
async function loadActiveReviewLink(token: string, notFoundMessage: string): Promise<StudioReviewLinkRow> {
  const link = await findActiveStudioReviewLinkByToken(token);
  if (!link) throw new DomainError(404, "NOT_FOUND", notFoundMessage);
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
    throw new DomainError(410, "EXPIRED", "Review link has expired");
  }
  return link;
}

/** Public: a review link resolved to its project summary + comments. */
export async function getPublicReview(token: string) {
  const link = await loadActiveReviewLink(token, "Review link not found or inactive");
  const db = getDb();
  const project = await findProjectById(db, link.projectId);
  const comments = await listStudioReviewComments(db, link.projectId);
  return {
    projectId: link.projectId,
    project: project ? { id: project.id, status: project.status, videoId: project.videoId } : null,
    comments,
    linkName: link.name,
  };
}

export type PublicReviewCommentInput = Omit<StudioReviewCommentInsert, "projectId" | "authorUserId">;

/** Public: an anonymous reviewer's comment through a share link. */
export async function addPublicReviewComment(
  token: string,
  input: PublicReviewCommentInput,
): Promise<StudioReviewCommentRow> {
  const link = await loadActiveReviewLink(token, "Review link not found");
  return insertStudioReviewComment(getDb(), { ...input, projectId: link.projectId, authorUserId: null });
}

export function listProjectReviewComments(projectId: string): Promise<StudioReviewCommentRow[]> {
  return listStudioReviewComments(getDb(), projectId);
}

export function addProjectReviewComment(input: StudioReviewCommentInsert): Promise<StudioReviewCommentRow> {
  return insertStudioReviewComment(getDb(), input);
}

export function setReviewCommentResolved(id: string, resolved: boolean): Promise<StudioReviewCommentRow | undefined> {
  return setStudioReviewCommentResolved(getDb(), id, resolved);
}

export function deleteReviewComment(id: string): Promise<void> {
  return deleteStudioReviewComment(getDb(), id);
}
