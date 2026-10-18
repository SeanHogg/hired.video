/**
 * RecruiterListsRepository — recruiter-scoped candidate collections (gap
 * #1360) stored in the polymorphic `lists` / `list_items` tables since
 * migration 0624 (W3-D2): a recruiter list is `lists.kind` `recruiter_list`
 * or `call_queue`, each member a `list_items` row with entity_type
 * `talent_pool_candidate`. Rows are mapped back to the legacy
 * /api/recruiter/lists shapes (`recruiterId`, `name`, `kind: list|call_queue`,
 * `talentPoolCandidateId`) so the API and extension stay unchanged.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import {
  RECRUITER_LIST_KINDS,
  listKindToRecruiterKind,
  recruiterKindToListKind,
  type RecruiterApiKind,
} from "../../../shared/lists.js";

const { lists, listItems, talentPoolCandidates } = schema;

const MEMBER_TYPE = "talent_pool_candidate";

export interface RecruiterListRow {
  id: string;
  recruiterId: string;
  name: string;
  description: string | null;
  kind: RecruiterApiKind;
  createdAt: Date;
  updatedAt: Date;
}

export interface RecruiterListMemberRow {
  id: string;
  listId: string;
  talentPoolCandidateId: string;
  position: number;
  addedAt: Date;
}

const isRecruiterList = inArray(lists.kind, [...RECRUITER_LIST_KINDS]);

function toListRow(row: typeof lists.$inferSelect): RecruiterListRow {
  return {
    id: row.id,
    recruiterId: row.ownerUserId,
    name: row.title,
    description: row.description ?? null,
    kind: listKindToRecruiterKind(row.kind),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toMemberRow(row: typeof listItems.$inferSelect): RecruiterListMemberRow {
  return {
    id: row.id,
    listId: row.listId,
    talentPoolCandidateId: row.entityId,
    position: row.position,
    addedAt: row.addedAt,
  };
}

export async function insertRecruiterList(values: {
  recruiterId: string;
  name: string;
  description?: string | null;
  kind: RecruiterApiKind;
}): Promise<RecruiterListRow> {
  const [row] = await getDb()
    .insert(lists)
    .values({
      ownerUserId: values.recruiterId,
      title: values.name,
      description: values.description ?? null,
      kind: recruiterKindToListKind(values.kind),
      isPrivate: true,
    })
    .returning();
  return toListRow(row);
}

export async function listRecruiterLists(recruiterId: string): Promise<RecruiterListRow[]> {
  const rows = await getDb()
    .select()
    .from(lists)
    .where(and(eq(lists.ownerUserId, recruiterId), isRecruiterList))
    .orderBy(desc(lists.updatedAt));
  return rows.map(toListRow);
}

/** Owner of a recruiter list (null when no such recruiter list exists). */
export async function findRecruiterListOwner(listId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ ownerUserId: lists.ownerUserId })
    .from(lists)
    .where(and(eq(lists.id, listId), isRecruiterList))
    .limit(1);
  return row ? row.ownerUserId : null;
}

export async function deleteRecruiterList(listId: string): Promise<void> {
  await getDb().delete(lists).where(and(eq(lists.id, listId), isRecruiterList));
}

/** Throws on the (list, entity) unique conflict — caller treats as duplicate. */
export async function insertRecruiterListMember(
  listId: string,
  talentPoolCandidateId: string,
  addedByUserId: string,
): Promise<RecruiterListMemberRow> {
  const [row] = await getDb()
    .insert(listItems)
    .values({ listId, entityType: MEMBER_TYPE, entityId: talentPoolCandidateId, addedByUserId })
    .returning();
  return toMemberRow(row);
}

/** Members in queue order. Inner join: an item whose talent-pool row was
 *  deleted (polymorphic items carry no FK) is not shown. */
export async function listRecruiterListMembers(listId: string) {
  return getDb()
    .select({
      id: listItems.id,
      talentPoolCandidateId: listItems.entityId,
      position: listItems.position,
      addedAt: listItems.addedAt,
      candidateName: talentPoolCandidates.candidateName,
      candidateTitle: talentPoolCandidates.candidateTitle,
      currentCompany: talentPoolCandidates.currentCompany,
      candidateEmail: talentPoolCandidates.candidateEmail,
    })
    .from(listItems)
    .innerJoin(talentPoolCandidates, eq(listItems.entityId, talentPoolCandidates.id))
    .where(and(eq(listItems.listId, listId), eq(listItems.entityType, MEMBER_TYPE)))
    .orderBy(asc(listItems.position), asc(listItems.addedAt));
}

export async function deleteRecruiterListMember(listId: string, memberId: string): Promise<void> {
  await getDb().delete(listItems).where(and(eq(listItems.id, memberId), eq(listItems.listId, listId)));
}
