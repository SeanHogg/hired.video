/**
 * Shared rules for the agency recruiting surface (/api/recruit, gap #99):
 * company-scope enforcement on top of services/company/scope.ts, the
 * caller's scope bootstrap (`GET /my-scope`), the redaction-profile →
 * rules mapping used by both public share views, and the patch helper.
 */
import { DomainError } from "../../domains/errors.js";
import { resolveCompanyScope, userCanAccessCompany } from "../company/scope.js";
import { DEFAULT_REDACTION_RULES, type RedactionRules } from "../resume/redaction.js";
import type { RedactionProfileRow } from "../../repositories/redactionProfilesRepository.js";
import { findRedactionProfilesForCompanies } from "../../repositories/redactionProfilesRepository.js";
import { findBrandKitsForOwner, findCompanySummariesByIds } from "../../repositories/recruitBrandingRepository.js";

export function forbidden(): DomainError {
  return new DomainError(403, "FORBIDDEN", "Access denied");
}

export function notFound(message: string): DomainError {
  return new DomainError(404, "NOT_FOUND", message);
}

/** 403 unless the caller may act on the company. */
export async function assertCompanyAccess(userId: string, companyId: string): Promise<void> {
  if (!(await userCanAccessCompany(userId, companyId))) throw forbidden();
}

/** The row (404 with `notFoundMessage` when missing), after a company-access
 *  check (403). The order — existence first, then tenancy — is the API's. */
export async function requireCompanyRow<T extends { companyId: string }>(
  userId: string,
  row: T | null,
  notFoundMessage: string,
): Promise<T> {
  if (!row) throw notFound(notFoundMessage);
  await assertCompanyAccess(userId, row.companyId);
  return row;
}

/**
 * Resolve the company ids a list endpoint reads. Null when the caller has
 * no companies (the endpoint answers `[]`); 403 when an explicit
 * `companyId` filter is outside the caller's scope.
 */
export async function resolveListScope(
  userId: string,
  companyIdFilter: string | undefined,
): Promise<{ companyIds: string[]; companyId?: string } | null> {
  const scope = await resolveCompanyScope(userId, companyIdFilter);
  if (scope.companyIds.length === 0) return null;
  if (companyIdFilter && !scope.companyIds.includes(companyIdFilter)) throw forbidden();
  return { companyIds: scope.companyIds, companyId: companyIdFilter || undefined };
}

/** GET /api/recruit/my-scope — the companies the caller recruits for, plus
 *  their brand kits and the redaction profiles of those companies. */
export async function getRecruitScope(userId: string) {
  const scope = await resolveCompanyScope(userId);
  if (scope.companyIds.length === 0) {
    return { companies: [], brandKits: [], redactionProfiles: [] };
  }
  const [companies, brandKits, profiles] = await Promise.all([
    findCompanySummariesByIds(scope.companyIds),
    findBrandKitsForOwner(userId),
    findRedactionProfilesForCompanies(scope.companyIds),
  ]);
  return {
    primaryCompanyId: scope.primaryCompanyId,
    companies,
    brandKits,
    redactionProfiles: profiles,
  };
}

/** Redaction rules for a profile (the platform default when there is none). */
export function rulesFromProfile(profile: RedactionProfileRow | null): RedactionRules {
  if (!profile) return DEFAULT_REDACTION_RULES;
  return {
    hideName: profile.hideName,
    hideEmail: profile.hideEmail,
    hidePhone: profile.hidePhone,
    hideAddress: profile.hideAddress,
    hideLinkedin: profile.hideLinkedin,
    hideOtherUrls: profile.hideOtherUrls,
    hideAvatar: profile.hideAvatar,
    replacementName: profile.replacementName,
    hideCompanyNames: profile.hideCompanyNames,
    hideSchoolNames: profile.hideSchoolNames,
    extraStripPaths: (profile.extraStripPaths as string[]) ?? [],
  };
}

/** Only the keys the caller actually sent (PATCH semantics: undefined = untouched). */
export function definedFields<T extends object>(input: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(input) as Array<keyof T>) {
    if (input[key] !== undefined) out[key] = input[key];
  }
  return out;
}

/** A share's public token is dead once inactive or past its expiry. */
export function isShareLive(share: { isActive: boolean; expiresAt: Date | null }): boolean {
  if (!share.isActive) return false;
  return !(share.expiresAt && share.expiresAt.getTime() < Date.now());
}
