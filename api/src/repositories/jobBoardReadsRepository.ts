/**
 * JobBoardReadsRepository — public, read-only projections over `job_items`
 * for the discovery job board (AI-ranked pool, "more like this") and the
 * salary SEO pages. Plain CRUD on job_items stays on JobsRepository; these
 * are the lean column projections the public surfaces render.
 */
import { and, desc, eq, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { jobItems } = schema;

/** `lower(column) LIKE %token%` — token must already be lower-cased. */
const containsLower = (column: AnyColumn, token: string): SQL =>
  sql`lower(${column}) like ${"%" + token + "%"}`;

/** Newest active jobs for the ranking pool, optionally remote-only and/or
 *  location-matched (`location` lower-cased). */
export function listJobBoardPool(
  db: Db,
  opts: { remote: boolean; location: string; limit: number },
) {
  const conditions: SQL[] = [eq(jobItems.isActive, true)];
  if (opts.remote) conditions.push(eq(jobItems.isRemote, true));
  if (opts.location) conditions.push(containsLower(jobItems.location, opts.location));
  return db
    .select({
      id: jobItems.id,
      title: jobItems.title,
      description: jobItems.description,
      company: jobItems.company,
      location: jobItems.location,
      salaryMin: jobItems.salaryMin,
      salaryMax: jobItems.salaryMax,
      createdAt: jobItems.createdAt,
      sponsored: jobItems.sponsored,
      sponsoredRankBoost: jobItems.sponsoredRankBoost,
    })
    .from(jobItems)
    .where(and(...conditions))
    .orderBy(desc(jobItems.createdAt))
    .limit(opts.limit);
}

export async function findJobTitleAndCompany(
  db: Db,
  jobId: string,
): Promise<{ title: string; company: string | null } | null> {
  const [row] = await db
    .select({ title: jobItems.title, company: jobItems.company })
    .from(jobItems)
    .where(eq(jobItems.id, jobId))
    .limit(1);
  return row ?? null;
}

/** Newest active jobs whose title contains `titleToken` (lower-cased);
 *  any active job when the token is null. */
export function listActiveJobsByTitleToken(db: Db, titleToken: string | null, limit: number) {
  return db
    .select({ id: jobItems.id, title: jobItems.title, company: jobItems.company, createdAt: jobItems.createdAt })
    .from(jobItems)
    .where(and(eq(jobItems.isActive, true), titleToken ? containsLower(jobItems.title, titleToken) : sql`true`))
    .orderBy(desc(jobItems.createdAt))
    .limit(limit);
}

/** Salary bounds of active jobs whose title (and optionally location)
 *  contains the given lower-cased tokens. */
export function listSalaryBoundsForRole(
  db: Db,
  opts: { titleToken: string; locationToken: string | null; limit: number },
) {
  const where: SQL[] = [eq(jobItems.isActive, true), containsLower(jobItems.title, opts.titleToken)];
  if (opts.locationToken) where.push(containsLower(jobItems.location, opts.locationToken));
  return db
    .select({ salaryMin: jobItems.salaryMin, salaryMax: jobItems.salaryMax })
    .from(jobItems)
    .where(and(...where))
    .limit(opts.limit);
}
