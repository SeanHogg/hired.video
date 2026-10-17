// company-scope.ts — Resolves the set of company_ids the requesting user
// is authorised to read/write on recruiting-platform resources. Used as
// the row-level filter for candidate_resumes, redaction_profiles,
// candidate résumé + pitch-deck share links (share_links), and pitch_decks.
//
// MVP rule: a user has access to a company when they are the owner OR
// they have an active row in user_company_role_associations. Full RBAC
// (role enum, seat limits) is future work.

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";

/** Narrow Deps slice. These queries touch companyProfiles +
 *  userCompanyRoleAssociations — the second table isn't yet surfaced by
 *  CompaniesRepository, so scope resolution takes a raw DB handle. The
 *  handle is injected via `deps` so tests can pass the fake-db shim
 *  without hitting real Postgres. When a CompaniesRepository method for
 *  user↔company memberships lands, migrate the queries through it and
 *  drop this port. */
export interface CompanyScopeDeps {
  db: ReturnType<typeof getDb>;
}

const defaultScopeDeps = (): CompanyScopeDeps => ({ db: getDb() });

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
export async function getUserCompanyIds(
  userId: string,
  deps: CompanyScopeDeps = defaultScopeDeps(),
): Promise<string[]> {
  const owned = await deps.db
    .select({ id: schema.companyProfiles.id })
    .from(schema.companyProfiles)
    .where(eq(schema.companyProfiles.ownerId, userId));

  const memberships = await deps.db
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
  deps: CompanyScopeDeps = defaultScopeDeps(),
): Promise<CompanyScope> {
  const ids = await getUserCompanyIds(userId, deps);
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
  deps: CompanyScopeDeps = defaultScopeDeps(),
): Promise<boolean> {
  const [owner] = await deps.db
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

  const [member] = await deps.db
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
