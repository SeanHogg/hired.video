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
 *   1. The user who owns the company (`ownerId`) can always manage it.
 *   2. Any active member listed in `user_company_role_associations` can
 *      manage it (multi-recruiter team support — same model as jobs).
 *
 * #438 — Super-admin no longer auto-passes. Impersonation is the only
 * path for SA to act on a company they don't own, matching the UI gate
 * removed from `useEntityOwnership`.
 */
import type { MiddlewareHandler } from "hono";
import { and, eq } from "drizzle-orm";
import type { Variables, AppEnv } from "../../types/index.js";
import { error } from "../../types/index.js";
import { getDb, schema } from "../../db/index.js";
import { isUuid } from "../../../../shared/value-types.js";

type AppCtx = Parameters<MiddlewareHandler<AppEnv>>[0];

export interface CompanyAccess {
  companyId: string;
  ownerId: string;
}

type Db = ReturnType<typeof getDb>;
type CompanyRow = typeof schema.companyProfiles.$inferSelect;

/**
 * Resolve a company by either its UUID id or its url slug. Returns the
 * full row so callers that need owner / name / branding fields don't have
 * to re-query. Slug-form URLs (`/api/companies/hired-video-company`) and
 * id-form URLs (`/api/companies/<uuid>`) both route through here so every
 * `:id` handler treats them interchangeably.
 */
export async function findCompanyByIdOrSlug(
  db: Db,
  idOrSlug: string,
): Promise<CompanyRow | null> {
  const [row] = await db
    .select()
    .from(schema.companyProfiles)
    .where(
      isUuid(idOrSlug)
        ? eq(schema.companyProfiles.id, idOrSlug)
        : eq(schema.companyProfiles.slug, idOrSlug),
    )
    .limit(1);
  return row ?? null;
}

export async function requireCompanyOwner(
  c: AppCtx,
  idOrSlug: string,
): Promise<{ denied: Response | null; access: CompanyAccess | null }> {
  const userId = c.var.user?.sub as string | undefined;
  if (!userId) {
    return {
      denied: c.json(error("UNAUTHORIZED", "Authentication required"), 401),
      access: null,
    };
  }

  const db = getDb();
  const company = await findCompanyByIdOrSlug(db, idOrSlug);

  if (!company) {
    return {
      denied: c.json(error("NOT_FOUND", "Company not found"), 404),
      access: null,
    };
  }

  const access: CompanyAccess = { companyId: company.id, ownerId: company.ownerId };

  if (company.ownerId === userId) {
    return { denied: null, access };
  }

  const [membership] = await db
    .select({ id: schema.userCompanyRoleAssociations.id })
    .from(schema.userCompanyRoleAssociations)
    .where(
      and(
        eq(schema.userCompanyRoleAssociations.userId, userId),
        eq(schema.userCompanyRoleAssociations.companyId, company.id),
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
