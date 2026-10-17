/**
 * Creator portfolio use cases: own list, public gallery, create / update /
 * delete, and "feature this item" (one featured item per user).
 */
import { getDb } from "../../db/index.js";
import {
  listOwnPortfolio,
  listPublicPortfolio,
  insertPortfolioItem,
  findOwnedPortfolioItem,
  updatePortfolioItem,
  deletePortfolioItem,
  clearFeaturedPortfolio,
  type PortfolioItemPatch,
  type PortfolioItemRow,
} from "../../repositories/creatorPortfolioRepository.js";
import { isEmailVerifiedUser } from "./discovery.js";
import { ok, fail, type CreatorResult } from "./result.js";

export interface CreatePortfolioItemInput {
  title?: string;
  description?: string;
  mediaType?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  durationMs?: number;
  category?: string;
  tags?: string[];
  isPublic?: boolean;
}

const NOT_FOUND_MESSAGE = "Portfolio item not found";

export async function getOwnPortfolio(userId: string): Promise<PortfolioItemRow[]> {
  return listOwnPortfolio(getDb(), userId);
}

/** Public gallery; empty for unverified accounts (no existence leak). */
export async function getPublicPortfolio(targetId: string): Promise<PortfolioItemRow[]> {
  if (!(await isEmailVerifiedUser(targetId))) return [];
  return listPublicPortfolio(getDb(), targetId);
}

export async function createPortfolioItem(
  userId: string,
  body: CreatePortfolioItemInput,
): Promise<CreatorResult<PortfolioItemRow>> {
  if (!body.title?.trim() || !body.mediaUrl || !body.mediaType) {
    return fail(400, "VALIDATION_ERROR", "title, mediaUrl, mediaType are required");
  }
  if (!["video", "image"].includes(body.mediaType)) {
    return fail(400, "VALIDATION_ERROR", "mediaType must be 'video' or 'image'");
  }
  const row = await insertPortfolioItem(getDb(), {
    userId,
    title: body.title.trim(),
    description: body.description ?? null,
    mediaType: body.mediaType,
    mediaUrl: body.mediaUrl,
    thumbnailUrl: body.thumbnailUrl ?? null,
    durationMs: body.durationMs ?? null,
    category: body.category ?? null,
    tags: body.tags ?? [],
    isPublic: body.isPublic ?? true,
    source: "upload",
  });
  return ok(row, 201);
}

const UPDATABLE_FIELDS = ["title", "description", "thumbnailUrl", "category", "tags", "isPublic", "sortOrder"] as const;

export async function updateOwnPortfolioItem(
  userId: string,
  id: string,
  body: Record<string, unknown>,
): Promise<CreatorResult<PortfolioItemRow>> {
  const db = getDb();
  if (!(await findOwnedPortfolioItem(db, id, userId))) return fail(404, "NOT_FOUND", NOT_FOUND_MESSAGE);
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of UPDATABLE_FIELDS) {
    if (k in body) patch[k] = body[k];
  }
  return ok(await updatePortfolioItem(db, id, patch as PortfolioItemPatch));
}

export async function deleteOwnPortfolioItem(userId: string, id: string): Promise<CreatorResult<{ deleted: true }>> {
  const db = getDb();
  if (!(await findOwnedPortfolioItem(db, id, userId))) return fail(404, "NOT_FOUND", NOT_FOUND_MESSAGE);
  await deletePortfolioItem(db, id);
  return ok({ deleted: true as const });
}

/** Set as featured, clearing any other featured item first. */
export async function featureOwnPortfolioItem(userId: string, id: string): Promise<CreatorResult<PortfolioItemRow>> {
  const db = getDb();
  if (!(await findOwnedPortfolioItem(db, id, userId))) return fail(404, "NOT_FOUND", NOT_FOUND_MESSAGE);
  await clearFeaturedPortfolio(db, userId);
  return ok(await updatePortfolioItem(db, id, { isFeatured: true, updatedAt: new Date() }));
}
