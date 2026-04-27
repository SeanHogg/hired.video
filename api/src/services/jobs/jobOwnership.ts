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
import { and, eq } from "drizzle-orm";
import type { Variables } from "../../types/index.js";
import { error } from "../../types/index.js";
import { getDb, schema } from "../../db/index.js";

type AppCtx = Parameters<MiddlewareHandler<{ Variables: Variables }>>[0];

export interface JobAccess {
  jobId: string;
  ownerId: string | null;
  companyId: string | null;
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

  const db = getDb();
  const [job] = await db
    .select({
      ownerId: schema.jobItems.postedByUserId,
      companyId: schema.jobItems.companyId,
    })
    .from(schema.jobItems)
    .where(eq(schema.jobItems.id, jobId))
    .limit(1);

  if (!job) {
    return {
      denied: c.json(error("NOT_FOUND", "Job not found"), 404),
      access: null,
    };
  }

  const isSuperAdmin = c.var.user?.isSuperAdmin === true;
  const access: JobAccess = { jobId, ownerId: job.ownerId, companyId: job.companyId };

  if (isSuperAdmin || job.ownerId === userId) {
    return { denied: null, access };
  }

  // Company team co-management: any active company member can manage.
  if (job.companyId) {
    const [membership] = await db
      .select({ id: schema.userCompanyRoleAssociations.id })
      .from(schema.userCompanyRoleAssociations)
      .where(
        and(
          eq(schema.userCompanyRoleAssociations.userId, userId),
          eq(schema.userCompanyRoleAssociations.companyId, job.companyId),
          eq(schema.userCompanyRoleAssociations.isActive, true),
        ),
      )
      .limit(1);
    if (membership) return { denied: null, access };
  }

  return {
    denied: c.json(
      error("FORBIDDEN", "You don't have permission to manage this job"),
      403,
    ),
    access: null,
  };
}
