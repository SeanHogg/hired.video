/**
 * CompanyDirectoryRepository — read-side queries behind /api/companies:
 * the public directory, trending/followed lists, per-company job + engagement
 * counts, view events, slug lookups, and the employer branding page.
 *
 * Plain CRUD on `company_profiles` (insert / update / delete / find by id)
 * stays on `CompaniesRepository`; this module holds the directory-specific
 * queries so the route layer never touches Drizzle.
 */

import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import { countServerRecordedViews } from "./artifactViewStreams.js";

const { companyProfiles, companyFollowers, jobItems, employerBrandingPages } = schema;

export type CompanyProfileRow = typeof companyProfiles.$inferSelect;
export type JobItemRow = typeof jobItems.$inferSelect;
export type EmployerBrandingPageRow = typeof employerBrandingPages.$inferSelect;
export type EmployerBrandingPageInsert = typeof employerBrandingPages.$inferInsert;

// ── Directory listing ───────────────────────────────────────────────────────

export interface PublicCompanyQuery {
  search?: string;
  /** `null` = no geo filter; `[]` = filter set but nothing matched. */
  geoAllow: string[] | null;
  limit: number;
  offset: number;
}

/** Newest-first page of companies matching search + geo allowlist, plus the
 *  total match count. */
export async function listPublicCompanies(
  q: PublicCompanyQuery,
): Promise<{ rows: CompanyProfileRow[]; total: number }> {
  const db = getDb();
  const searchWhere = q.search
    ? or(ilike(companyProfiles.name, `%${q.search}%`), ilike(companyProfiles.description, `%${q.search}%`))
    : undefined;
  const where =
    q.geoAllow != null
      ? and(searchWhere, inArray(companyProfiles.id, q.geoAllow.length ? q.geoAllow : [""]))
      : searchWhere;

  const [rows, [countRow]] = await Promise.all([
    db.select().from(companyProfiles).where(where).orderBy(desc(companyProfiles.createdAt)).limit(q.limit).offset(q.offset),
    db.select({ count: sql<number>`count(*)::int` }).from(companyProfiles).where(where),
  ]);
  return { rows, total: countRow?.count ?? 0 };
}

/** Companies ranked by follower count (desc). */
export async function listTrendingCompanies(
  limit: number,
): Promise<Array<{ company: CompanyProfileRow; followerCount: number }>> {
  return getDb()
    .select({ company: companyProfiles, followerCount: sql<number>`count(${companyFollowers.userId})::int` })
    .from(companyProfiles)
    .leftJoin(companyFollowers, eq(companyFollowers.companyId, companyProfiles.id))
    .groupBy(companyProfiles.id)
    .orderBy(desc(sql`count(${companyFollowers.userId})`))
    .limit(limit);
}

/** Companies a user follows, most recently followed first. */
export async function listCompaniesFollowedBy(userId: string): Promise<CompanyProfileRow[]> {
  const rows = await getDb()
    .select({ company: companyProfiles })
    .from(companyFollowers)
    .innerJoin(companyProfiles, eq(companyProfiles.id, companyFollowers.companyId))
    .where(eq(companyFollowers.userId, userId))
    .orderBy(desc(companyFollowers.createdAt));
  return rows.map((r) => r.company);
}

/** Companies owned by a user, newest first. */
export async function listCompaniesByOwner(ownerId: string): Promise<CompanyProfileRow[]> {
  return getDb()
    .select()
    .from(companyProfiles)
    .where(eq(companyProfiles.ownerId, ownerId))
    .orderBy(desc(companyProfiles.createdAt));
}

export async function findCompanyBySlug(slug: string): Promise<CompanyProfileRow | null> {
  const [row] = await getDb().select().from(companyProfiles).where(eq(companyProfiles.slug, slug)).limit(1);
  return row ?? null;
}

/** True when some company already uses `slug`. */
export async function isCompanySlugTaken(slug: string): Promise<boolean> {
  const [conflict] = await getDb()
    .select({ id: companyProfiles.id })
    .from(companyProfiles)
    .where(eq(companyProfiles.slug, slug))
    .limit(1);
  return Boolean(conflict);
}

/** First company whose slug matches exactly or whose name matches
 *  case-insensitively — the extract-and-dedup lookup. */
export async function findCompanyBySlugOrName(slug: string, name: string): Promise<CompanyProfileRow | null> {
  const [row] = await getDb()
    .select()
    .from(companyProfiles)
    .where(or(eq(companyProfiles.slug, slug), ilike(companyProfiles.name, name)))
    .limit(1);
  return row ?? null;
}

// ── Jobs + engagement counts ────────────────────────────────────────────────

/** Newest active jobs posted under a company. */
export async function listActiveCompanyJobs(companyId: string, limit: number): Promise<JobItemRow[]> {
  return getDb()
    .select()
    .from(jobItems)
    .where(and(eq(jobItems.company, companyId), eq(jobItems.isActive, true)))
    .orderBy(desc(jobItems.createdAt))
    .limit(limit);
}

export interface CompanyEngagementCounts {
  jobCount: number;
  activeJobCount: number;
  followerCount: number;
}

/** Total jobs, active jobs and followers for a company. */
export async function countCompanyEngagement(companyId: string): Promise<CompanyEngagementCounts> {
  const db = getDb();
  const [jobsRow, activeJobsRow, followersRow] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(jobItems).where(eq(jobItems.company, companyId)),
    db.select({ count: sql<number>`count(*)::int` }).from(jobItems).where(and(eq(jobItems.company, companyId), eq(jobItems.isActive, true))),
    db.select({ count: sql<number>`count(*)::int` }).from(companyFollowers).where(eq(companyFollowers.companyId, companyId)),
  ]);
  return {
    jobCount: jobsRow[0]?.count ?? 0,
    activeJobCount: activeJobsRow[0]?.count ?? 0,
    followerCount: followersRow[0]?.count ?? 0,
  };
}

// ── View events ─────────────────────────────────────────────────────────────

/** Company page views = the server-recorded 'view' rows of artifact_views
 *  (kind 'company'; company_views folded in by W3-A 0580). The write side is
 *  recordArtifactView in services/company/companyDirectory.ts. */
export function countCompanyViews(companyId: string): Promise<number> {
  return countServerRecordedViews(getDb(), "company", companyId);
}

// ── Employer branding page ──────────────────────────────────────────────────

export async function findBrandingPage(companyId: string): Promise<EmployerBrandingPageRow | null> {
  const [page] = await getDb()
    .select()
    .from(employerBrandingPages)
    .where(eq(employerBrandingPages.companyId, companyId))
    .limit(1);
  return page ?? null;
}

export async function brandingPageExists(companyId: string): Promise<boolean> {
  const [existing] = await getDb()
    .select({ id: employerBrandingPages.id })
    .from(employerBrandingPages)
    .where(eq(employerBrandingPages.companyId, companyId))
    .limit(1);
  return Boolean(existing);
}

export async function updateBrandingPage(
  companyId: string,
  patch: Partial<EmployerBrandingPageInsert>,
): Promise<EmployerBrandingPageRow> {
  const [updated] = await getDb()
    .update(employerBrandingPages)
    .set(patch)
    .where(eq(employerBrandingPages.companyId, companyId))
    .returning();
  return updated;
}

export async function insertBrandingPage(values: EmployerBrandingPageInsert): Promise<EmployerBrandingPageRow> {
  const [created] = await getDb().insert(employerBrandingPages).values(values).returning();
  return created;
}
