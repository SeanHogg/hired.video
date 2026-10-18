/**
 * Recruiter lists / call queues (gap #1360) — recruiter-scoped collections
 * of talent-pool candidates, distinct from a job's pipeline. Stored in the
 * polymorphic lists / list_items tables (kinds recruiter_list | call_queue,
 * migration 0624); served here, hidden from the generic /api/lists overview.
 * Route: routes/recruiter/lists.ts.
 */
import { z } from "zod";
import { DomainError } from "../../domains/errors.js";
import {
  deleteRecruiterList,
  deleteRecruiterListMember,
  findRecruiterListOwner,
  insertRecruiterList,
  insertRecruiterListMember,
  listRecruiterListMembers,
  listRecruiterLists,
  type RecruiterListMemberRow,
} from "../../repositories/recruiterListsRepository.js";
import type { JsonBody } from "./talent-pool.js";
import { RECRUITER_API_KINDS } from "../../../../shared/lists.js";
import { findOwnedTalentPoolEntry } from "../../repositories/talentPoolRepository.js";

export const RecruiterListSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  kind: z.enum(RECRUITER_API_KINDS).default("list"),
});

async function assertOwnsList(recruiterId: string, listId: string): Promise<void> {
  const owner = await findRecruiterListOwner(listId);
  if (!owner || owner !== recruiterId) throw new DomainError(404, "NOT_FOUND", "List not found");
}

export async function createRecruiterList(recruiterId: string, rawBody: unknown) {
  const parsed = RecruiterListSchema.safeParse(rawBody);
  if (!parsed.success) throw new DomainError(400, "VALIDATION_ERROR", "Invalid list", parsed.error.flatten());
  return insertRecruiterList({
    recruiterId,
    name: parsed.data.name,
    description: parsed.data.description,
    kind: parsed.data.kind,
  });
}

export const getRecruiterLists = listRecruiterLists;

export async function removeRecruiterList(recruiterId: string, listId: string): Promise<{ deleted: true }> {
  await assertOwnsList(recruiterId, listId);
  await deleteRecruiterList(listId);
  return { deleted: true };
}

/** Idempotent add: a (list, candidate) unique conflict reports `duplicate`. */
export async function addRecruiterListMember(
  recruiterId: string,
  listId: string,
  body: JsonBody,
): Promise<{ row: RecruiterListMemberRow } | { duplicate: true }> {
  const candidateId = String(body?.talentPoolCandidateId ?? "");
  if (!candidateId) throw new DomainError(400, "VALIDATION_ERROR", "talentPoolCandidateId required");
  await assertOwnsList(recruiterId, listId);
  // Polymorphic list items carry no FK: the member must be one of the
  // recruiter's own talent-pool rows.
  if (!(await findOwnedTalentPoolEntry(recruiterId, candidateId))) {
    throw new DomainError(404, "NOT_FOUND", "Candidate not found");
  }
  try {
    return { row: await insertRecruiterListMember(listId, candidateId, recruiterId) };
  } catch {
    return { duplicate: true };
  }
}

export async function getRecruiterListMembers(recruiterId: string, listId: string) {
  await assertOwnsList(recruiterId, listId);
  return listRecruiterListMembers(listId);
}

export async function removeRecruiterListMember(recruiterId: string, listId: string, memberId: string): Promise<{ deleted: true }> {
  await assertOwnsList(recruiterId, listId);
  await deleteRecruiterListMember(listId, memberId);
  return { deleted: true };
}
