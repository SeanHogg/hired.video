/**
 * RecruiterListsRepository — recruiter-scoped candidate collections
 * (`recruiter_lists`, kind `list` | `call_queue`, gap #1360) and their
 * members (`recruiter_list_members`, each a talent-pool candidate).
 *
 * NOT the polymorphic /api/lists tables — different storage. Folding these
 * into the polymorphic list tables is a Wave 3 table merge
 * (docs/plans/2026-10-17-architecture-remediation.md).
 */
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";

const { recruiterLists, recruiterListMembers, talentPoolCandidates } = schema;

export type RecruiterListRow = typeof recruiterLists.$inferSelect;
export type RecruiterListInsert = typeof recruiterLists.$inferInsert;
export type RecruiterListMemberRow = typeof recruiterListMembers.$inferSelect;

export async function insertRecruiterList(values: RecruiterListInsert): Promise<RecruiterListRow> {
  const [row] = await getDb().insert(recruiterLists).values(values).returning();
  return row;
}

export async function listRecruiterLists(recruiterId: string): Promise<RecruiterListRow[]> {
  return getDb()
    .select()
    .from(recruiterLists)
    .where(eq(recruiterLists.recruiterId, recruiterId))
    .orderBy(desc(recruiterLists.updatedAt));
}

/** Owner of a list (null when the list does not exist). */
export async function findRecruiterListOwner(listId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ recruiterId: recruiterLists.recruiterId })
    .from(recruiterLists)
    .where(eq(recruiterLists.id, listId))
    .limit(1);
  return row ? row.recruiterId : null;
}

export async function deleteRecruiterList(listId: string): Promise<void> {
  await getDb().delete(recruiterLists).where(eq(recruiterLists.id, listId));
}

/** Throws on the (list_id, candidate_id) unique conflict — caller treats as duplicate. */
export async function insertRecruiterListMember(listId: string, talentPoolCandidateId: string): Promise<RecruiterListMemberRow> {
  const [row] = await getDb().insert(recruiterListMembers).values({ listId, talentPoolCandidateId }).returning();
  return row;
}

export async function listRecruiterListMembers(listId: string) {
  return getDb()
    .select({
      id: recruiterListMembers.id,
      talentPoolCandidateId: recruiterListMembers.talentPoolCandidateId,
      position: recruiterListMembers.position,
      addedAt: recruiterListMembers.addedAt,
      candidateName: talentPoolCandidates.candidateName,
      candidateTitle: talentPoolCandidates.candidateTitle,
      currentCompany: talentPoolCandidates.currentCompany,
      candidateEmail: talentPoolCandidates.candidateEmail,
    })
    .from(recruiterListMembers)
    .leftJoin(talentPoolCandidates, eq(recruiterListMembers.talentPoolCandidateId, talentPoolCandidates.id))
    .where(eq(recruiterListMembers.listId, listId))
    .orderBy(recruiterListMembers.position);
}

export async function deleteRecruiterListMember(memberId: string): Promise<void> {
  await getDb().delete(recruiterListMembers).where(eq(recruiterListMembers.id, memberId));
}
