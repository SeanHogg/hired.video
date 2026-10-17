/**
 * Recruiter lists / call queues (gap #1360) — recruiter-scoped collections
 * of talent-pool candidates, distinct from a job's pipeline.
 * NOT the polymorphic /api/lists feature (different tables); the table
 * merge is Wave 3. Route: routes/recruiter/lists.ts.
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

export const RecruiterListSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  kind: z.enum(["list", "call_queue"]).default("list"),
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
  try {
    return { row: await insertRecruiterListMember(listId, candidateId) };
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
  await deleteRecruiterListMember(memberId);
  return { deleted: true };
}
