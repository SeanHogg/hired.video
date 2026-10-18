/** Public / per-user job reads (job board search, poster's jobs, detail). */
import { and, desc, eq, gte, ilike, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { jobItemCardColumns } from "../../repositories/jobListColumns.js";
import { schema } from "../../db/index.js";
import { normalizeEmploymentType } from "../../../../shared/employment-types.js";
import { normalizeWorkSetting } from "../../../../shared/work-settings.js";
import { normalizeSeniority } from "../../../../shared/seniority.js";
import type { PaginatedJobsDTO } from "../../../../shared/job.js";
import { canViewerManageJob } from "../jobs/jobOwnership.js";
import { type JobServiceDeps, resolveDeps } from "./job-service-deps.js";
import { type JobEntity, rowToJob } from "./job-entity.js";

const { jobItems } = schema;

type JobItemRow = typeof jobItems.$inferSelect;

/** Cap on the poster's own-jobs list (`/getsummaryitems`, `/user-jobs`). */
const USER_JOBS_MAX = 1000;

/** One newest-first page of the public listing; card reads blank the body. */
async function selectJobPage(
  db: JobServiceDeps["db"],
  where: SQL | undefined,
  limit: number,
  offset: number,
  omitBody: boolean,
): Promise<JobItemRow[]> {
  if (omitBody) {
    return db.select(jobItemCardColumns).from(jobItems).where(where)
      .orderBy(desc(jobItems.createdAt)).limit(limit).offset(offset);
  }
  return db.select().from(jobItems).where(where).orderBy(desc(jobItems.createdAt)).limit(limit).offset(offset);
}

export interface JobQuery {
  page?: number;
  limit?: number;
  search?: string;
  location?: string;
  // Facet filters (#10)
  employmentType?: string;
  experienceLevel?: string;
  salaryMin?: number;
  salaryMax?: number;
  isRemote?: boolean;
  /** Work-setting facet (#2069): 'onsite' | 'remote' | 'hybrid'. Maps to
   *  `job_items.work_setting` via the partial index from migration 0216.
   *  Lets candidates filter for hybrid roles, which `isRemote` could not. */
  workSetting?: string;
  /** Sector filter (#1168). Maps to `job_items.sector` via the partial
   *  index from migration 0112. */
  sector?: string;
  /**
   * Pre-resolved geo intersection — list of job ids that matched the
   * structured LocationFilter. Routes call LocationService.applyLocationFilter
   * and pass the result here. `null`/omitted = no geo filter; `[]` = filter
   * applied but matched zero rows (return empty page).
   */
  entityIdAllowlist?: string[] | null;
  /** Card-view read: skip the `description` / `details` body columns in SQL
   *  (repositories/jobListColumns.ts). Only for callers whose response
   *  projection drops every body-derived field. */
  omitBody?: boolean;
}

export async function getPublicJobs(filters?: JobQuery,
  deps?: Partial<JobServiceDeps>): Promise<PaginatedJobsDTO> {
  const d = resolveDeps(deps); const db = d.db;
  const page = filters?.page ?? 1;
  const limit = Math.min(filters?.limit ?? 10, 100);
  const offset = (page - 1) * limit;

  // Full-text search: use PostgreSQL tsvector when the query has multiple meaningful words,
  // fall back to ilike for single short tokens (e.g. partial-word autocomplete).
  const buildSearchClause = (search: string) => {
    const trimmed = search.trim();
    if (!trimmed) return undefined;
    // plainto_tsquery handles multi-word queries, stemming, and stop-words.
    // The tsvector is computed on-the-fly; add a GIN index on
    //   to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || coalesce(company,''))
    // to make this fast at scale.
    return or(
      sql`to_tsvector('english', coalesce(${jobItems.title},'') || ' ' || coalesce(${jobItems.description},'') || ' ' || coalesce(${jobItems.company},'')) @@ plainto_tsquery('english', ${trimmed})`,
      ilike(jobItems.title, `%${trimmed}%`),
      ilike(jobItems.company, `%${trimmed}%`));
  };

  // Short-circuit: a structured geo filter that matched no rows wins
  // over every other clause. Avoids paying for a full table scan only
  // to filter the result down to zero.
  if (filters?.entityIdAllowlist && filters.entityIdAllowlist.length === 0) {
    return {
      items: [],
      total: 0,
      page,
      limit,
      totalPages: 1,
      hasNext: false,
      hasPrev: page > 1,
    };
  }

  const whereClause = and(
    eq(jobItems.isActive, true),
    // #154/#1493 — archived jobs are soft-deleted: the archive route stamps
    // `archivedAt` but does NOT flip `isActive`, so without this clause an
    // archived ("hidden from default listings") job kept showing in public
    // search. Exclude them here so archive actually hides the row.
    isNull((jobItems as any).archivedAt),
    filters?.search ? buildSearchClause(filters.search) : undefined,
    // The free-text `location` ilike stays as a *fallback* when no
    // structured allowlist is set — preserves search for legacy rows
    // whose location hasn't been geocoded yet (see migration 0109).
    filters?.location && !filters.entityIdAllowlist
      ? ilike(jobItems.location, `%${filters.location}%`)
      : undefined,
    filters?.entityIdAllowlist && filters.entityIdAllowlist.length > 0
      ? inArray(jobItems.id, filters.entityIdAllowlist)
      : undefined,
    filters?.employmentType
      ? eq(jobItems.jobType, normalizeEmploymentType(filters.employmentType) ?? filters.employmentType)
      : undefined,
    filters?.experienceLevel
      ? eq(jobItems.experienceLevel, normalizeSeniority(filters.experienceLevel) ?? filters.experienceLevel)
      : undefined,
    filters?.isRemote !== undefined ? eq(jobItems.isRemote, filters.isRemote) : undefined,
    filters?.workSetting
      ? eq((jobItems as any).workSetting, normalizeWorkSetting(filters.workSetting) ?? filters.workSetting)
      : undefined,
    filters?.salaryMin !== undefined ? gte(jobItems.salaryMin as any, String(filters.salaryMin)) : undefined,
    filters?.salaryMax !== undefined ? lte(jobItems.salaryMax as any, String(filters.salaryMax)) : undefined,
    filters?.sector ? eq((jobItems as any).sector, filters.sector) : undefined);

  const [rows, countResult] = await Promise.all([
    selectJobPage(db, whereClause, limit, offset, filters?.omitBody === true),
    db.select({ count: sql<number>`count(*)` }).from(jobItems).where(whereClause),
  ]);

  const total = Number(countResult[0]?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
    items: rows.map(rowToJob),
    total,
    page,
    limit,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

export async function getUserJobs(userId: string,
  deps?: Partial<JobServiceDeps>): Promise<JobEntity[]> {
  const d = resolveDeps(deps); const db = d.db;
  const rows = await db
    .select()
    .from(jobItems)
    .where(eq((jobItems as any).postedByUserId, userId))
    .orderBy(desc(jobItems.createdAt))
    // Unbounded before; a poster's own list never needs more than this.
    .limit(USER_JOBS_MAX);
  return rows.map(rowToJob);
}

export async function getJobById(id: string,
  deps?: Partial<JobServiceDeps>,
  viewer?: { userId: string; isSuperAdmin: boolean }): Promise<JobEntity | null> {
  const d = resolveDeps(deps); const db = d.db;
  const [row] = await db.select().from(jobItems).where(eq(jobItems.id, id)).limit(1);
  if (!row) return null;
  const dto = rowToJob(row);
  if (viewer) {
    // Stamp the backend-authoritative manage flag so the frontend can
    // gate Edit / Delete / Candidates + Reports without re-deriving the
    // rule. See `canViewerManageJob` for the canonical rule.
    const result = await canViewerManageJob(viewer.userId, viewer.isSuperAdmin, id);
    dto.viewerCanManage = result?.canManage === true;
  }
  return dto;
}

export async function getJobBySlug(
  slug: string,
  viewer?: { userId: string; isSuperAdmin: boolean },
): Promise<JobEntity | null> {
  return getJobById(slug, undefined, viewer);
}
