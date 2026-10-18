/**
 * Interview question-set library use cases. A set is owned by a user
 * (personal) OR a company (shared with its active members); the xor is
 * enforced by SQL and by `createQuestionSet` picking the owner. Data access:
 * InterviewQuestionSetsRepository + the company-membership lookup in
 * listsRepository. Failures are DomainErrors with the route's original
 * status/code/message.
 */
import { DomainError } from "../../domains/errors.js";
import { USER_ROLES } from "../../../../shared/user-roles.js";
import {
  InterviewQuestionSetsRepository,
  type QuestionSetInsert,
  type QuestionSetPatch,
  type QuestionSetRow,
} from "../../repositories/interviewQuestionSetsRepository.js";
import { findActiveCompanyIdsForUser } from "../../repositories/listsRepository.js";

export interface QuestionSetActor {
  userId: string;
  roles: readonly string[] | undefined;
}

const ASSIGNABLE_ROLES: ReadonlySet<string> = new Set([
  USER_ROLES.RECRUITER,
  USER_ROLES.EMPLOYER,
  USER_ROLES.ADMIN,
  USER_ROLES.SUPER_ADMIN,
]);

function requireRecruiterRole(actor: QuestionSetActor, message: string): void {
  if (!actor.roles?.some((r) => ASSIGNABLE_ROLES.has(r))) throw new DomainError(403, "FORBIDDEN", message);
}

async function canReadSet(set: QuestionSetRow, userId: string): Promise<boolean> {
  if (set.ownerUserId === userId) return true;
  if (set.ownerCompanyId) {
    const ids = await findActiveCompanyIdsForUser(userId);
    return ids.includes(set.ownerCompanyId);
  }
  return false;
}

/** Every set the user can see (their own + their active companies'). */
export async function listQuestionSets(
  actor: QuestionSetActor,
  includeArchived: boolean,
  repo = new InterviewQuestionSetsRepository(),
): Promise<QuestionSetRow[]> {
  requireRecruiterRole(actor, "Only recruiters or employers can manage question sets");
  const companyIds = await findActiveCompanyIdsForUser(actor.userId);
  return repo.listVisible(actor.userId, companyIds, includeArchived);
}

export type CreateQuestionSetInput = Omit<
  QuestionSetInsert,
  "id" | "ownerUserId" | "ownerCompanyId" | "ownerType" | "ownerId"
> & {
  /** Company-owned (shared) set when present; caller must be an active member. */
  companyId?: string;
};

export async function createQuestionSet(
  actor: QuestionSetActor,
  { companyId, ...fields }: CreateQuestionSetInput,
  repo = new InterviewQuestionSetsRepository(),
): Promise<QuestionSetRow> {
  requireRecruiterRole(actor, "Only recruiters or employers can create question sets");
  if (companyId) {
    const allowed = await findActiveCompanyIdsForUser(actor.userId);
    if (!allowed.includes(companyId)) throw new DomainError(403, "FORBIDDEN", "You're not a member of that company");
  }
  return repo.insert({
    ...fields,
    ownerUserId: companyId ? null : actor.userId,
    ownerCompanyId: companyId ?? null,
    // Canonical (owner_type, owner_id) pair (#1641, mig 0165) — was only
    // backfilled, so every set created since had it NULL.
    ownerType: companyId ? "company" : "user",
    ownerId: companyId ?? actor.userId,
  });
}

/** The set, when it exists and the user may read it (404 / 403 otherwise). */
export async function getReadableQuestionSet(
  userId: string,
  id: string,
  repo = new InterviewQuestionSetsRepository(),
): Promise<QuestionSetRow> {
  const row = await repo.findById(id);
  if (!row) throw new DomainError(404, "NOT_FOUND", "Question set not found");
  if (!(await canReadSet(row, userId))) throw new DomainError(403, "FORBIDDEN", "Not your question set");
  return row;
}

export async function updateQuestionSet(
  userId: string,
  id: string,
  patch: QuestionSetPatch,
  repo = new InterviewQuestionSetsRepository(),
): Promise<QuestionSetRow | null> {
  await getReadableQuestionSet(userId, id, repo);
  return repo.update(id, patch);
}

/** Soft-delete (is_archived = true). */
export async function archiveQuestionSet(
  userId: string,
  id: string,
  repo = new InterviewQuestionSetsRepository(),
): Promise<void> {
  await getReadableQuestionSet(userId, id, repo);
  await repo.update(id, { isArchived: true });
}
