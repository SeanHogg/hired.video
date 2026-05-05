/**
 * Company-ownership permission helpers — used by every route that lets a
 * recruiter / employer manage a company-scoped resource (profile, locations,
 * team, branding).
 *
 * Mirrors `services/jobs/jobOwnership.ts` so the access rules stay aligned
 * across job + company surfaces. The frontend `useEntityOwnership` hook
 * implements the same predicate so UI affordances and API gates can never
 * drift.
 *
 * Returns `null` on success or a Hono Response on denial — call sites do
 *   const { denied } = await requireCompanyOwner(c, companyId);
 *   if (denied) return denied;
 *
 * Authorization rules (single place to extend later):
 *   1. Super-admin can manage any company.
 *   2. The user who owns the company (`ownerId`) can always manage it.
 *   3. Any active member listed in `user_company_role_associations` can
 *      manage it (multi-recruiter team support — same model as jobs).
 */
import type { MiddlewareHandler } from "hono";
import { and, eq } from "drizzle-orm";
import type { Variables } from "../../types/index.js";
import { error } from "../../types/index.js";
import { getDb, schema } from "../../db/index.js";

type AppCtx = Parameters<MiddlewareHandler<{ Variables: Variables }>>[0];

export interface CompanyAccess {
  companyId: string;
  ownerId: string;
}

export async function requireCompanyOwner(
  c: AppCtx,
  companyId: string,
): Promise<{ denied: Response | null; access: CompanyAccess | null }> {
  const userId = c.var.user?.sub as string | undefined;
  if (!userId) {
    return {
      denied: c.json(error("UNAUTHORIZED", "Authentication required"), 401),
      access: null,
    };
  }

  const db = getDb();
  const [company] = await db
    .select({ ownerId: schema.companyProfiles.ownerId })
    .from(schema.companyProfiles)
    .where(eq(schema.companyProfiles.id, companyId))
    .limit(1);

  if (!company) {
    return {
      denied: c.json(error("NOT_FOUND", "Company not found"), 404),
      access: null,
    };
  }

  const isSuperAdmin = c.var.user?.isSuperAdmin === true;
  const access: CompanyAccess = { companyId, ownerId: company.ownerId };

  if (isSuperAdmin || company.ownerId === userId) {
    return { denied: null, access };
  }

  const [membership] = await db
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
  if (membership) return { denied: null, access };

  return {
    denied: c.json(
      error("FORBIDDEN", "You don't have permission to manage this company"),
      403,
    ),
    access: null,
  };
}
