// company-scope.ts — Resolves the set of company_ids the requesting user
// is authorised to read/write on recruiting-platform resources. Used as
// the row-level filter for candidate_resumes, redaction_profiles,
// candidate_resume_shares, pitch_decks, and pitch_deck_shares.
//
// MVP rule: a user has access to a company when they are the owner OR
// they have an active row in user_company_role_associations. Full RBAC
// (role enum, seat limits) is future work.

import { and, eq, or } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";

export interface CompanyScope {
  companyIds: string[];
  /** Most-recent or explicitly-active company. Used when the caller needs a
   *  single default company (e.g. creating a new candidate resume). */
  primaryCompanyId: string | null;
}

/**
 * Returns every company the user can act on. Combines:
 *   1. Companies they own (`company_profiles.ownerId`).
 *   2. Companies they have an active membership in
 *      (`user_company_role_associations.isActive = true`).
 * Deduplicates preserving owner-first ordering.
 */
export async function getUserCompanyIds(userId: string): Promise<string[]> {
  const db = getDb();

  const owned = await db
    .select({ id: schema.companyProfiles.id })
    .from(schema.companyProfiles)
    .where(eq(schema.companyProfiles.ownerId, userId));

  const memberships = await db
    .select({ id: schema.userCompanyRoleAssociations.companyId })
    .from(schema.userCompanyRoleAssociations)
    .where(
      and(
        eq(schema.userCompanyRoleAssociations.userId, userId),
        eq(schema.userCompanyRoleAssociations.isActive, true),
      ),
    );

  const seen = new Set<string>();
  const ids: string[] = [];
  for (const row of [...owned, ...memberships]) {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      ids.push(row.id);
    }
  }
  return ids;
}

/**
 * Resolves the caller's scope into an object containing the full id list
 * and a `primaryCompanyId` suitable for defaults. If an `explicit` id is
 * supplied it becomes the primary iff it's in the scope.
 */
export async function resolveCompanyScope(
  userId: string,
  explicit?: string | null,
): Promise<CompanyScope> {
  const ids = await getUserCompanyIds(userId);
  let primary: string | null = null;
  if (explicit && ids.includes(explicit)) primary = explicit;
  else if (ids.length > 0) primary = ids[0];
  return { companyIds: ids, primaryCompanyId: primary };
}

/**
 * Returns true if the caller may act on the given company. Used by route
 * handlers to enforce row-level tenancy on reads/writes.
 */
export async function userCanAccessCompany(
  userId: string,
  companyId: string,
): Promise<boolean> {
  const db = getDb();
  const [owner] = await db
    .select({ id: schema.companyProfiles.id })
    .from(schema.companyProfiles)
    .where(
      and(
        eq(schema.companyProfiles.id, companyId),
        eq(schema.companyProfiles.ownerId, userId),
      ),
    )
    .limit(1);
  if (owner) return true;

  const [member] = await db
    .select({ id: schema.userCompanyRoleAssociations.id })
    .from(schema.userCompanyRoleAssociations)
    .where(
      and(
        eq(schema.userCompanyRoleAssociations.userId, userId),
        eq(schema.userCompanyRoleAssociations.companyId, companyId),
        eq(schema.userCompanyRoleAssociations.isActive, true),
      ),
    )
    .limit(1);
  return Boolean(member);
}
