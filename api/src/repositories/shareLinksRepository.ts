/**
 * ShareLinksRepository — the ONE persistence seam for `share_links`
 * (W3-A, migration 0583): every tokenised share link / invite, whatever it
 * opens. Every read and write is scoped to a subject type, so an id or token
 * of one kind can never resolve through another kind's endpoint.
 *
 * Kind-specific thin wrappers (which map a row to that kind's legacy API
 * shape) live next to their aggregate:
 *   candidateResumeSharesRepository · pitchDecksRepository (shares) ·
 *   services/pipeline/PipelineShareService · studioReviewLinksRepository ·
 *   referenceSharesRepository · gamePlayInvitesRepository.
 */
import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import type { ShareLinkSubjectType } from "../../../shared/share-link-subjects.js";

const { shareLinks } = schema;

export type ShareLinkRow = typeof shareLinks.$inferSelect;
/** Insert values without the discriminator — the caller passes it separately. */
export type ShareLinkValues = Omit<typeof shareLinks.$inferInsert, "subjectType">;
export type ShareLinkPatch = Partial<Omit<typeof shareLinks.$inferInsert, "id" | "subjectType" | "createdAt">>;

/** Legacy `isActive` flag → `revoked_at` (the kinds that exposed is_active
 *  map it back as `revokedAt === null`). */
export function revokedAtFor(isActive: boolean): Date | null {
  return isActive ? null : new Date();
}

export interface ShareLinkListFilter {
  /** One subject, or any of several. */
  subjectId?: string;
  subjectIds?: string[];
  /** Restrict to these companies (candidate_resume links). */
  companyIds?: string[];
  limit?: number;
}

/** A kind's links, newest first. */
export async function listShareLinks(
  subjectType: ShareLinkSubjectType,
  filter: ShareLinkListFilter,
): Promise<ShareLinkRow[]> {
  const conditions: SQL[] = [eq(shareLinks.subjectType, subjectType)];
  if (filter.subjectId) conditions.push(eq(shareLinks.subjectId, filter.subjectId));
  if (filter.subjectIds) conditions.push(inArray(shareLinks.subjectId, filter.subjectIds));
  if (filter.companyIds) conditions.push(inArray(shareLinks.companyId, filter.companyIds));
  const query = getDb()
    .select()
    .from(shareLinks)
    .where(and(...conditions))
    .orderBy(desc(shareLinks.createdAt));
  if (filter.limit) return query.limit(filter.limit);
  return query;
}

export async function findShareLinkById(
  subjectType: ShareLinkSubjectType,
  id: string,
): Promise<ShareLinkRow | null> {
  const [row] = await getDb()
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.id, id), eq(shareLinks.subjectType, subjectType)))
    .limit(1);
  return row ?? null;
}

/** Token lookup — the stored token is the raw URL token (never hashed). */
export async function findShareLinkByToken(
  subjectType: ShareLinkSubjectType,
  token: string,
): Promise<ShareLinkRow | null> {
  const [row] = await getDb()
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.shareToken, token), eq(shareLinks.subjectType, subjectType)))
    .limit(1);
  return row ?? null;
}

export async function insertShareLink(
  subjectType: ShareLinkSubjectType,
  values: ShareLinkValues,
): Promise<ShareLinkRow> {
  const [row] = await getDb()
    .insert(shareLinks)
    .values({ ...values, subjectType })
    .returning();
  return row;
}

/** Patch one link (optionally only when it belongs to `subjectId`); bumps
 *  `updatedAt`. Null when no row matched. */
export async function updateShareLink(
  subjectType: ShareLinkSubjectType,
  id: string,
  patch: ShareLinkPatch,
  opts: { subjectId?: string } = {},
): Promise<ShareLinkRow | null> {
  const conditions: SQL[] = [eq(shareLinks.id, id), eq(shareLinks.subjectType, subjectType)];
  if (opts.subjectId) conditions.push(eq(shareLinks.subjectId, opts.subjectId));
  const [row] = await getDb()
    .update(shareLinks)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(...conditions))
    .returning();
  return row ?? null;
}

/** Hard-delete one link; returns the removed id (null when none matched). */
export async function deleteShareLink(subjectType: ShareLinkSubjectType, id: string): Promise<string | null> {
  const [row] = await getDb()
    .delete(shareLinks)
    .where(and(eq(shareLinks.id, id), eq(shareLinks.subjectType, subjectType)))
    .returning({ id: shareLinks.id });
  return row?.id ?? null;
}

/** Record one public view: atomic counter bump + first/last-viewed stamps. */
export async function recordShareLinkView(id: string): Promise<void> {
  await getDb()
    .update(shareLinks)
    .set({
      viewCount: sql`${shareLinks.viewCount} + 1`,
      lastViewedAt: new Date(),
      firstViewedAt: sql`COALESCE(${shareLinks.firstViewedAt}, now())`,
    })
    .where(eq(shareLinks.id, id));
}

/** Record one join through an invite link (game_play). */
export async function incrementShareLinkJoins(id: string): Promise<void> {
  await getDb()
    .update(shareLinks)
    .set({ joinedCount: sql`${shareLinks.joinedCount} + 1` })
    .where(eq(shareLinks.id, id));
}
