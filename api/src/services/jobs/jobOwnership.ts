/**
 * Job-ownership permission helpers — used by every route that lets a
 * recruiter / employer manage a job-scoped resource (pipeline, sourcing
 * config, share links, etc.).
 *
 * Returns `null` on success or a Hono Response on denial — call sites do
 *   const { denied } = await requireJobOwner(c, jobId);
 *   if (denied) return denied;
 *
 * Authorization rules (single place to extend later):
 *   1. Super-admin can manage any job.
 *   2. The user who posted the job (`postedByUserId`) can always manage it.
 *   3. If the job has a `companyId`, any active member of that company can
 *      manage it (multi-recruiter team support).
 */
import type { MiddlewareHandler } from "hono";
import { and, eq, inArray, or } from "drizzle-orm";
import type { Variables, AppEnv } from "../../types/index.js";
import { error } from "../../types/index.js";
import { getDb, schema } from "../../db/index.js";
import { getUserCompanyIds } from "../company/scope.js";

type AppCtx = Parameters<MiddlewareHandler<AppEnv>>[0];

export interface JobAccess {
  jobId: string;
  ownerId: string | null;
  companyId: string | null;
}

/**
 * Pure boolean check used both by `requireJobOwner` (route gate) and by
 * `JobService.getJobById` to stamp `viewerCanManage` onto the DTO so the
 * frontend doesn't have to re-derive the same rule (which is how the Edit
 * Job button / Candidates+Reports tabs were leaking to non-owners).
 *
 * Returns `null` if the job doesn't exist so the caller can surface a 404.
 *
 * #438 — Super-admin no longer auto-passes this check. The UI override
 * was removed (impersonation is the only path for SA to act on a job
 * they don't own); the API now enforces the same rule for symmetry, so
 * a curl against `DELETE /api/jobs/:id` from an SA token without an
 * active impersonation also fails. The legacy `/admin/*` tooling that
 * needed unrestricted access should re-acquire ownership via the
 * impersonation flow rather than relying on a silent bypass.
 */
export async function canViewerManageJob(
  viewerUserId: string,
  isSuperAdmin: boolean,
  jobId: string,
): Promise<{ canManage: boolean; access: JobAccess } | null> {
  void isSuperAdmin;
  const db = getDb();
  const [job] = await db
    .select({
      ownerId: schema.jobItems.postedByUserId,
      companyId: schema.jobItems.companyId,
    })
    .from(schema.jobItems)
    .where(eq(schema.jobItems.id, jobId))
    .limit(1);

  if (!job) return null;

  const access: JobAccess = { jobId, ownerId: job.ownerId, companyId: job.companyId };

  if (job.ownerId === viewerUserId) {
    return { canManage: true, access };
  }

  if (job.companyId) {
    const [membership] = await db
      .select({ id: schema.userCompanyRoleAssociations.id })
      .from(schema.userCompanyRoleAssociations)
      .where(
        and(
          eq(schema.userCompanyRoleAssociations.userId, viewerUserId),
          eq(schema.userCompanyRoleAssociations.companyId, job.companyId),
          eq(schema.userCompanyRoleAssociations.isActive, true),
        ),
      )
      .limit(1);
    if (membership) return { canManage: true, access };
  }

  return { canManage: false, access };
}

/**
 * Resolves every job the viewer is authorised to manage — the same rule as
 * `canViewerManageJob`, but applied set-wise so cross-job surfaces (the
 * cross-job pipeline kanban, #405) can scope a single query instead of
 * checking each job individually. A job is manageable when the viewer
 * posted it (`postedByUserId`) OR it belongs to a company the viewer is an
 * active member/owner of (`companyId` ∈ their company scope).
 *
 * Returns the bare jobId list so callers can `WHERE jobId IN (...)`.
 */
export async function resolveManageableJobIds(viewerUserId: string): Promise<string[]> {
  const db = getDb();
  const companyIds = await getUserCompanyIds(viewerUserId);
  const rows = await db
    .select({ id: schema.jobItems.id })
    .from(schema.jobItems)
    .where(
      companyIds.length > 0
        ? or(
            eq(schema.jobItems.postedByUserId, viewerUserId),
            inArray(schema.jobItems.companyId, companyIds),
          )
        : eq(schema.jobItems.postedByUserId, viewerUserId),
    );
  return rows.map((r: { id: string }) => r.id);
}

export async function requireJobOwner(
  c: AppCtx,
  jobId: string,
): Promise<{ denied: Response | null; access: JobAccess | null }> {
  const userId = c.var.user?.sub as string | undefined;
  if (!userId) {
    return {
      denied: c.json(error("UNAUTHORIZED", "Authentication required"), 401),
      access: null,
    };
  }

  const isSuperAdmin = c.var.user?.isSuperAdmin === true;
  const result = await canViewerManageJob(userId, isSuperAdmin, jobId);

  if (!result) {
    return {
      denied: c.json(error("NOT_FOUND", "Job not found"), 404),
      access: null,
    };
  }

  if (result.canManage) {
    return { denied: null, access: result.access };
  }

  return {
    denied: c.json(
      error("FORBIDDEN", "You don't have permission to manage this job"),
      403,
    ),
    access: null,
  };
}
