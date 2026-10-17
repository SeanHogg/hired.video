/**
 * Redaction-profile use cases (agency recruiting, gap #99): reusable
 * per-company PII-stripping rule sets. Marking a profile default clears
 * the company's previous default first (one default per company).
 */
import * as repo from "../../repositories/redactionProfilesRepository.js";
import type { RedactionProfileRow } from "../../repositories/redactionProfilesRepository.js";
import { assertCompanyAccess, definedFields, requireCompanyRow, resolveListScope } from "./access.js";
import type { CreateRedactionProfileInput, UpdateRedactionProfileInput } from "./schemas.js";

const NOT_FOUND = "Redaction profile not found";

export async function listRedactionProfiles(
  userId: string,
  companyIdFilter: string | undefined,
): Promise<RedactionProfileRow[]> {
  const scope = await resolveListScope(userId, companyIdFilter);
  if (!scope) return [];
  return repo.listRedactionProfiles(scope);
}

export async function getRedactionProfile(userId: string, id: string): Promise<RedactionProfileRow> {
  return requireCompanyRow(userId, await repo.findRedactionProfileById(id), NOT_FOUND);
}

export async function createRedactionProfile(
  userId: string,
  input: CreateRedactionProfileInput,
): Promise<RedactionProfileRow> {
  await assertCompanyAccess(userId, input.companyId);
  if (input.isDefault) await repo.clearDefaultRedactionProfile(input.companyId);

  return repo.insertRedactionProfile({
    companyId: input.companyId,
    name: input.name,
    description: input.description ?? null,
    isDefault: input.isDefault ?? false,
    hideName: input.hideName ?? true,
    hideEmail: input.hideEmail ?? true,
    hidePhone: input.hidePhone ?? true,
    hideAddress: input.hideAddress ?? true,
    hideLinkedin: input.hideLinkedin ?? true,
    hideOtherUrls: input.hideOtherUrls ?? false,
    hideAvatar: input.hideAvatar ?? true,
    replacementName: input.replacementName ?? "Candidate",
    hideCompanyNames: input.hideCompanyNames ?? false,
    hideSchoolNames: input.hideSchoolNames ?? false,
    extraStripPaths: input.extraStripPaths ?? [],
  });
}

export async function updateRedactionProfile(
  userId: string,
  id: string,
  input: UpdateRedactionProfileInput,
): Promise<RedactionProfileRow | null> {
  const existing = await requireCompanyRow(userId, await repo.findRedactionProfileById(id), NOT_FOUND);
  if (input.isDefault) await repo.clearDefaultRedactionProfile(existing.companyId);
  return repo.updateRedactionProfile(id, definedFields(input));
}

export async function deleteRedactionProfile(userId: string, id: string): Promise<{ deleted: true }> {
  await requireCompanyRow(userId, await repo.findRedactionProfileById(id), NOT_FOUND);
  await repo.deleteRedactionProfile(id);
  return { deleted: true };
}
