/**
 * AI thumbnail candidate use cases (#142): replace a project's un-selected
 * candidate set, list candidates, pick the live thumbnail. Every write busts
 * the public engagement cache that serves the candidates. Access (who may act
 * on the project) is checked by the caller first. SQL lives in
 * repositories/studioThumbnailsRepository.ts.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { invalidatePublicEngagement } from "./public-engagement.js";
import {
  clearThumbnailSelection,
  deleteUnselectedThumbnails,
  insertThumbnails,
  listThumbnailsByProject,
  markThumbnailSelected,
  type StudioThumbnailRow,
} from "../../repositories/studioThumbnailsRepository.js";

export interface ScoredThumbnailCandidate {
  imageUrl: string;
  storageKey?: string;
  sourceTimeSec?: number;
  score: number;
}

/** Clear the project's prior un-selected candidates, persist the new ranked
 *  set, and return it best score first. */
export async function replaceThumbnailCandidates(
  userId: string,
  projectId: string,
  ranked: readonly ScoredThumbnailCandidate[],
  headlineHint: string | undefined,
): Promise<StudioThumbnailRow[]> {
  const db = getDb();
  await deleteUnselectedThumbnails(db, projectId);
  const inserted = await insertThumbnails(db, ranked.map((r) => ({
    projectId,
    userId,
    imageUrl: r.imageUrl,
    storageKey: r.storageKey ?? null,
    sourceTimeSec: r.sourceTimeSec ?? null,
    headlineText: headlineHint ?? null,
    score: r.score,
    isSelected: false,
  })));
  invalidatePublicEngagement(projectId);
  return inserted.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

export function listThumbnails(projectId: string): Promise<StudioThumbnailRow[]> {
  return listThumbnailsByProject(getDb(), projectId);
}

/** Make `thumbnailId` the project's only selected thumbnail; 404 when it is
 *  not one of the project's candidates. */
export async function selectThumbnail(projectId: string, thumbnailId: string): Promise<StudioThumbnailRow> {
  const db = getDb();
  await clearThumbnailSelection(db, projectId);
  const selected = await markThumbnailSelected(db, projectId, thumbnailId);
  invalidatePublicEngagement(projectId);
  if (!selected) throw new DomainError(404, "NOT_FOUND", "Thumbnail not found");
  return selected;
}
