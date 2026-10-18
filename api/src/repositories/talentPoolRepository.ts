/**
 * TalentPoolRepository — the recruiter CRM talent pool aggregate
 * (`talent_pool_candidates`) plus its interaction log
 * (`candidate_interactions`). Every query is recruiter-scoped except the
 * lookups the callers explicitly document otherwise.
 *
 * Inserts / patches accept a loose record because the HTTP bodies are
 * untyped JSON (numeric columns arrive as numbers); drizzle serialises
 * them as before.
 */
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";

const { talentPoolCandidates, candidateInteractions, users } = schema;

export type TalentPoolRow = typeof talentPoolCandidates.$inferSelect;
export type TalentPoolInsert = typeof talentPoolCandidates.$inferInsert;
export type InteractionRow = typeof candidateInteractions.$inferSelect;
export type InteractionInsert = typeof candidateInteractions.$inferInsert;

/** Role of a user (null when the user does not exist). */
export async function findUserRole(userId: string): Promise<string | null> {
  const [u] = await getDb()
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return u ? u.role : null;
}

export async function insertTalentPoolEntry(values: Record<string, unknown>): Promise<TalentPoolRow> {
  const [row] = await getDb().insert(talentPoolCandidates).values(values as TalentPoolInsert).returning();
  return row;
}

/** Every entry for the recruiter, newest first. */
export async function listTalentPoolForRecruiter(recruiterId: string): Promise<TalentPoolRow[]> {
  return getDb()
    .select()
    .from(talentPoolCandidates)
    .where(eq(talentPoolCandidates.recruiterId, recruiterId))
    .orderBy(desc(talentPoolCandidates.addedAt));
}

/** Number of entries in the recruiter's talent pool (dashboard tile). */
export async function countTalentPoolForRecruiter(recruiterId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(talentPoolCandidates)
    .where(eq(talentPoolCandidates.recruiterId, recruiterId));
  return Number(row?.n ?? 0);
}

export async function isCandidateInPool(recruiterId: string, candidateUserId: string): Promise<boolean> {
  const [existing] = await getDb()
    .select({ id: talentPoolCandidates.id })
    .from(talentPoolCandidates)
    .where(and(eq(talentPoolCandidates.recruiterId, recruiterId), eq(talentPoolCandidates.candidateId, candidateUserId)))
    .limit(1);
  return Boolean(existing);
}

export async function findOwnedTalentPoolEntry(recruiterId: string, id: string): Promise<TalentPoolRow | null> {
  const [entry] = await getDb()
    .select()
    .from(talentPoolCandidates)
    .where(and(eq(talentPoolCandidates.id, id), eq(talentPoolCandidates.recruiterId, recruiterId)))
    .limit(1);
  return entry ?? null;
}

/** Unscoped read by id (used to resolve an extracted profile's linked row). */
export async function findTalentPoolEntryById(id: string): Promise<TalentPoolRow | null> {
  const [entry] = await getDb()
    .select()
    .from(talentPoolCandidates)
    .where(eq(talentPoolCandidates.id, id))
    .limit(1);
  return entry ?? null;
}

export async function updateOwnedTalentPoolEntry(
  recruiterId: string,
  id: string,
  patch: Record<string, unknown>,
): Promise<TalentPoolRow | null> {
  const [updated] = await getDb()
    .update(talentPoolCandidates)
    .set(patch as Partial<TalentPoolInsert>)
    .where(and(eq(talentPoolCandidates.id, id), eq(talentPoolCandidates.recruiterId, recruiterId)))
    .returning();
  return updated ?? null;
}

export async function deleteOwnedTalentPoolEntry(recruiterId: string, id: string): Promise<void> {
  await getDb()
    .delete(talentPoolCandidates)
    .where(and(eq(talentPoolCandidates.id, id), eq(talentPoolCandidates.recruiterId, recruiterId)));
}

/** Candidate user id behind a talent-pool entry (unscoped, as before). */
export async function findCandidateIdForEntry(talentPoolId: string): Promise<string | null> {
  const [entry] = await getDb()
    .select({ candidateId: talentPoolCandidates.candidateId })
    .from(talentPoolCandidates)
    .where(eq(talentPoolCandidates.id, talentPoolId))
    .limit(1);
  return entry ? entry.candidateId : null;
}

/** Ids of the recruiter's ACTIVE entries (match-scoring fan-out count). */
export async function listActiveEntryIds(recruiterId: string): Promise<Array<{ id: string }>> {
  return getDb()
    .select({ id: talentPoolCandidates.id })
    .from(talentPoolCandidates)
    .where(and(eq(talentPoolCandidates.recruiterId, recruiterId), eq(talentPoolCandidates.status, "active")));
}

// ── Bulk operations ─────────────────────────────────────────────────────────

/** The recruiter's entries whose email is in `emails` (one batched query —
 *  the email-dedup lookup for ATS imports). */
export async function findEntriesByEmails(
  recruiterId: string,
  emails: string[],
): Promise<Array<{ id: string; email: string | null }>> {
  if (emails.length === 0) return [];
  return getDb()
    .select({ id: talentPoolCandidates.id, email: talentPoolCandidates.candidateEmail })
    .from(talentPoolCandidates)
    .where(and(eq(talentPoolCandidates.recruiterId, recruiterId), inArray(talentPoolCandidates.candidateEmail, emails)));
}

/** Multi-row insert in one statement; returns each new entry's id + email. */
export async function insertTalentPoolEntries(
  values: TalentPoolInsert[],
): Promise<Array<{ id: string; email: string | null }>> {
  if (values.length === 0) return [];
  return getDb()
    .insert(talentPoolCandidates)
    .values(values)
    .returning({ id: talentPoolCandidates.id, email: talentPoolCandidates.candidateEmail });
}

export async function findOwnedEntryTags(
  recruiterId: string,
  ids: string[],
): Promise<Array<{ id: string; tags: unknown }>> {
  return getDb()
    .select({ id: talentPoolCandidates.id, tags: talentPoolCandidates.tags })
    .from(talentPoolCandidates)
    .where(and(inArray(talentPoolCandidates.id, ids), eq(talentPoolCandidates.recruiterId, recruiterId)));
}

export async function bulkSetStatus(recruiterId: string, ids: string[], status: string): Promise<number> {
  const result = await getDb()
    .update(talentPoolCandidates)
    .set({ status, updatedAt: new Date() })
    .where(and(inArray(talentPoolCandidates.id, ids), eq(talentPoolCandidates.recruiterId, recruiterId)))
    .returning({ id: talentPoolCandidates.id });
  return result.length;
}

export async function bulkDeleteEntries(recruiterId: string, ids: string[]): Promise<number> {
  const result = await getDb()
    .delete(talentPoolCandidates)
    .where(and(inArray(talentPoolCandidates.id, ids), eq(talentPoolCandidates.recruiterId, recruiterId)))
    .returning({ id: talentPoolCandidates.id });
  return result.length;
}

// ── Interactions ────────────────────────────────────────────────────────────

export async function insertInteraction(values: Record<string, unknown>): Promise<InteractionRow> {
  const [row] = await getDb().insert(candidateInteractions).values(values as InteractionInsert).returning();
  return row;
}

export async function listInteractionsForEntry(recruiterId: string, talentPoolId: string): Promise<InteractionRow[]> {
  return getDb()
    .select()
    .from(candidateInteractions)
    .where(and(eq(candidateInteractions.talentPoolId, talentPoolId), eq(candidateInteractions.recruiterId, recruiterId)))
    .orderBy(desc(candidateInteractions.interactionDate));
}
