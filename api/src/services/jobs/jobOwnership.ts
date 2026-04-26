/**
 * Job-ownership permission helpers — used by every route that lets a
 * recruiter / employer manage a job-scoped resource (pipeline, sourcing
 * config, share links, etc.).
 *
 * Returns `null` on success or a Hono Response on denial — call sites do
 * `const denied = await requireJobOwner(c, jobId); if (denied) return denied;`.
 *
 * Authorization rules (single place to extend later):
 *   - The user who posted the job (`postedByUserId`) can manage it
 *   - Any super-admin can manage it
 *   - Future: company-team membership (gated behind a real `companyId` FK
 *     on `jobItems`, which doesn't exist yet — see README "Consolidated
 *     Gap Register")
 */
import type { MiddlewareHandler } from "hono";
import { eq } from "drizzle-orm";
import type { Variables } from "../../types/index.js";
import { error } from "../../types/index.js";
import { getDb, schema } from "../../db/index.js";

type AppCtx = Parameters<MiddlewareHandler<{ Variables: Variables }>>[0];

export interface JobAccess {
  jobId: string;
  ownerId: string | null;
}

/**
 * Returns null if the caller may manage the given job, else a JSON Response.
 * Also surfaces the resolved owner id so callers can avoid a second SELECT.
 */
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
    .select({ ownerId: schema.jobItems.postedByUserId })
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
  if (job.ownerId === userId || isSuperAdmin) {
    return { denied: null, access: { jobId, ownerId: job.ownerId } };
  }

  return {
    denied: c.json(error("FORBIDDEN", "Only the job owner can manage this resource"), 403),
    access: null,
  };
}
