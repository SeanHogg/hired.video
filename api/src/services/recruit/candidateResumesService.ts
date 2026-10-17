/**
 * Candidate résumé use cases (agency recruiting, gap #99): recruiter-owned
 * résumé records with a variant tree (`parentId`) and at most one ACTIVE
 * variant per (company, talent_pool_candidate). Every use case enforces
 * company tenancy and throws DomainError on failure.
 */
import { DomainError } from "../../domains/errors.js";
import * as repo from "../../repositories/candidateResumesRepository.js";
import type { CandidateResumeInsert, CandidateResumeRow } from "../../repositories/candidateResumesRepository.js";
import { assertCompanyAccess, definedFields, requireCompanyRow, resolveListScope } from "./access.js";
import type { BulkCsvInput, CreateCandidateResumeInput, UpdateCandidateResumeInput } from "./schemas.js";

const NOT_FOUND = "Candidate resume not found";

export async function listCandidateResumes(
  userId: string,
  query: { companyId?: string; talentPoolCandidateId?: string; activeOnly: boolean },
): Promise<CandidateResumeRow[]> {
  const scope = await resolveListScope(userId, query.companyId);
  if (!scope) return [];
  return repo.listCandidateResumes({
    ...scope,
    talentPoolCandidateId: query.talentPoolCandidateId,
    activeOnly: query.activeOnly,
  });
}

export async function getCandidateResume(userId: string, id: string): Promise<CandidateResumeRow> {
  return requireCompanyRow(userId, await repo.findCandidateResumeById(id), NOT_FOUND);
}

/**
 * Create a root résumé or (with `parentId`) a variant; the parent must
 * belong to the same company. A new row created active deactivates its
 * siblings in the same (company, talent_pool_candidate) bucket.
 */
export async function createCandidateResume(
  userId: string,
  input: CreateCandidateResumeInput,
): Promise<CandidateResumeRow> {
  await assertCompanyAccess(userId, input.companyId);

  if (input.parentId) {
    const parent = await repo.findCandidateResumeById(input.parentId);
    if (!parent || parent.companyId !== input.companyId) {
      throw new DomainError(400, "VALIDATION_ERROR", "parentId does not belong to this company");
    }
  }

  const row = await repo.insertCandidateResume({
    companyId: input.companyId,
    importedByUserId: userId,
    talentPoolCandidateId: input.talentPoolCandidateId ?? null,
    linkedUserId: input.linkedUserId ?? null,
    mergedFromUserResumeId: input.mergedFromUserResumeId ?? null,
    parentId: input.parentId ?? null,
    isActive: input.isActive ?? false,
    label: input.label ?? null,
    content: input.content,
    recruiterNotes: input.recruiterNotes ?? null,
    metadata: input.metadata ?? {},
  });

  if (row.isActive && row.talentPoolCandidateId) {
    await repo.deactivateActiveVariants(row.companyId, row.talentPoolCandidateId);
    // Re-flip ourselves back on — the bulk deactivation touches the new row too.
    await repo.updateCandidateResume(row.id, { isActive: true });
  }
  return row;
}

/** Bulk-create thin JSON Resumes (basics + skills) from parsed CSV rows. */
export async function bulkImportCandidateResumes(
  userId: string,
  input: BulkCsvInput,
): Promise<{ created: CandidateResumeRow[]; count: number }> {
  await assertCompanyAccess(userId, input.companyId);

  const inserts: CandidateResumeInsert[] = input.rows.map((r) => ({
    companyId: input.companyId,
    importedByUserId: userId,
    label: r.label ?? r.name,
    content: {
      basics: {
        name: r.name,
        label: r.label ?? null,
        email: r.email ?? null,
        phone: r.phone ?? null,
        location: r.location ? { city: r.location } : null,
        profiles: r.linkedinUrl ? [{ network: "LinkedIn", url: r.linkedinUrl }] : [],
      },
      skills: (r.skills ?? []).map((s) => ({ name: s })),
    },
    metadata: { source: "csv_import" },
  }));

  const created = await repo.insertCandidateResumes(inserts);
  return { created, count: created.length };
}

export async function updateCandidateResume(
  userId: string,
  id: string,
  input: UpdateCandidateResumeInput,
): Promise<CandidateResumeRow | null> {
  await requireCompanyRow(userId, await repo.findCandidateResumeById(id), NOT_FOUND);
  return repo.updateCandidateResume(id, definedFields(input));
}

/** Delete a résumé (child variants are detached by the FK). */
export async function deleteCandidateResume(userId: string, id: string): Promise<{ deleted: true }> {
  await requireCompanyRow(userId, await repo.findCandidateResumeById(id), NOT_FOUND);
  await repo.deleteCandidateResume(id);
  return { deleted: true };
}

/** Make this variant the active one for its candidate (siblings flip off first). */
export async function activateCandidateResume(userId: string, id: string): Promise<CandidateResumeRow | null> {
  const target = await requireCompanyRow(userId, await repo.findCandidateResumeById(id), NOT_FOUND);
  if (!target.talentPoolCandidateId) {
    throw new DomainError(
      400,
      "VALIDATION_ERROR",
      "Resume is not linked to a talent_pool_candidate; cannot activate.",
    );
  }
  await repo.deactivateActiveVariants(target.companyId, target.talentPoolCandidateId);
  return repo.updateCandidateResume(target.id, { isActive: true });
}
