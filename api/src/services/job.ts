import { and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import type {
  ApplyJobDTO,
  CreateJobDTO,
  JobSummaryDTO,
  PaginatedJobsDTO,
} from "../../../shared/job.js";

const { jobItems, savedJobs, jobApplications, jobAlerts } = schema;

/** Stable string used as the "company" for jobs tracked through the
 * extension when we can't extract a real employer from the page.
 * Surfaced as the seed company on the public job board. */
export const HIRED_VIDEO_SEED_COMPANY = "hired.video Community";

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
}

export interface JobEntity extends JobSummaryDTO {
  isActive?: boolean;
  jobType?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  skills?: string[];
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
}

function rowToJob(row: typeof jobItems.$inferSelect): JobEntity {
  return {
    id: row.id,
    title: row.title,
    company: row.company ?? undefined,
    location: row.location ?? undefined,
    description: row.description,
    employmentType: row.jobType ?? undefined,
    experienceLevel: row.experienceLevel ?? undefined,
    salaryMin: row.salaryMin ? Number(row.salaryMin) : undefined,
    salaryMax: row.salaryMax ? Number(row.salaryMax) : undefined,
    salaryCurrency: row.salaryCurrency ?? "USD",
    skills: (row.skillsRequired as string[]) ?? [],
    isRemote: row.isRemote,
    isActive: row.isActive,
    slug: row.id,
    postedDate: new Date(row.createdAt).toISOString(),
    sourceUrl: row.sourceUrl ?? undefined,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    createdBy: (row as any).postedByUserId ?? undefined,
  } as JobEntity;
}

export async function getPublicJobs(filters?: JobQuery): Promise<PaginatedJobsDTO> {
  const db = getDb();
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
      ilike(jobItems.company, `%${trimmed}%`),
    );
  };

  const whereClause = and(
    eq(jobItems.isActive, true),
    filters?.search ? buildSearchClause(filters.search) : undefined,
    filters?.location ? ilike(jobItems.location, `%${filters.location}%`) : undefined,
    filters?.employmentType ? eq(jobItems.jobType, filters.employmentType) : undefined,
    filters?.experienceLevel ? eq(jobItems.experienceLevel, filters.experienceLevel) : undefined,
    filters?.isRemote !== undefined ? eq(jobItems.isRemote, filters.isRemote) : undefined,
    filters?.salaryMin !== undefined ? gte(jobItems.salaryMin as any, String(filters.salaryMin)) : undefined,
    filters?.salaryMax !== undefined ? lte(jobItems.salaryMax as any, String(filters.salaryMax)) : undefined,
  );

  const [rows, countResult] = await Promise.all([
    db.select().from(jobItems).where(whereClause).orderBy(desc(jobItems.createdAt)).limit(limit).offset(offset),
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

export async function getUserJobs(userId: string): Promise<JobEntity[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(jobItems)
    .where(eq((jobItems as any).postedByUserId, userId))
    .orderBy(desc(jobItems.createdAt));
  return rows.map(rowToJob);
}

export async function getJobById(id: string): Promise<JobEntity | null> {
  const db = getDb();
  const [row] = await db.select().from(jobItems).where(eq(jobItems.id, id)).limit(1);
  return row ? rowToJob(row) : null;
}

export async function createJob(job: CreateJobDTO, userId: string): Promise<JobEntity> {
  const db = getDb();
  const [row] = await db
    .insert(jobItems)
    .values({
      postedByUserId: userId,
      title: job.title,
      description: job.description,
      location: job.location,
      isRemote: false,
    } as any)
    .returning();
  return rowToJob(row!);
}

/**
 * Lightweight HTML → structured-job parser used by `POST /api/jobs/extract`.
 * Tries (in order):
 *   1. JSON-LD `JobPosting` (the gold standard — most ATSes emit this)
 *   2. OpenGraph `og:title` + `<meta name="description">`
 *   3. `<title>` + URL hostname as a last-resort fallback
 *
 * Pure string operations on purpose: we run inside a Cloudflare Worker so
 * there is no real DOM, and pulling in cheerio just for this one route is
 * not worth the bundle hit.
 */
export interface ParsedJob {
  title: string;
  description: string;
  company?: string;
  location?: string;
  isRemote?: boolean;
}

export function parseJobFromPage(input: { url?: string; html?: string }): ParsedJob {
  const html = input.html ?? "";
  const url = input.url ?? "";

  // 1. JSON-LD JobPosting
  const ldMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const block of ldMatches) {
    const inner = block.replace(/^[\s\S]*?>/, "").replace(/<\/script>\s*$/, "").trim();
    if (!inner) continue;
    try {
      const data = JSON.parse(inner);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const type = (item?.["@type"] ?? "").toString().toLowerCase();
        if (type !== "jobposting") continue;
        return {
          title: stripHtml(item.title ?? "").slice(0, 250) || fallbackTitle(url),
          description: stripHtml(item.description ?? "") || stripHtml(html).slice(0, 5000),
          company:
            stripHtml(item.hiringOrganization?.name ?? item.employmentUnit?.name ?? "") ||
            HIRED_VIDEO_SEED_COMPANY,
          location: stripHtml(
            item.jobLocation?.address?.addressLocality ??
              item.jobLocation?.address?.addressRegion ??
              item.jobLocation?.address?.addressCountry ??
              "",
          ) || undefined,
          isRemote: item.jobLocationType?.toString().toLowerCase().includes("telecommute"),
        };
      }
    } catch {
      // malformed JSON-LD block — fall through
    }
  }

  // 2. OpenGraph + meta description fallback
  const ogTitle = matchMeta(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  const ogDesc = matchMeta(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  const metaDesc = matchMeta(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  const ogSite = matchMeta(html, /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i);
  const docTitle = matchMeta(html, /<title[^>]*>([^<]+)<\/title>/i);

  const title = ogTitle || docTitle || fallbackTitle(url);
  const description = ogDesc || metaDesc || stripHtml(html).slice(0, 5000) || url;

  return {
    title: title.slice(0, 250),
    description,
    company: ogSite || HIRED_VIDEO_SEED_COMPANY,
    location: undefined,
    isRemote: undefined,
  };
}

function matchMeta(html: string, pattern: RegExp): string | undefined {
  const m = html.match(pattern);
  return m?.[1]?.trim();
}

function stripHtml(text: unknown): string {
  if (typeof text !== "string") return "";
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function fallbackTitle(url: string): string {
  try {
    const u = new URL(url);
    return `Job from ${u.hostname.replace(/^www\./, "")}`;
  } catch {
    return "Tracked Job";
  }
}

/**
 * Insert a job posting created via the extension and immediately
 * bookmark it so the calling user can see it in their `/saved` count.
 *
 * Public-by-default: `isActive` defaults to true on the column, which is
 * the only filter `getPublicJobs` applies — so the job lands on the
 * public board the moment it's inserted.
 */
export async function createTrackedJob(
  input: {
    title: string;
    description: string;
    company?: string;
    location?: string;
    sourceUrl?: string;
    isRemote?: boolean;
  },
  userId: string,
): Promise<JobEntity> {
  const db = getDb();
  const company = input.company?.trim() || HIRED_VIDEO_SEED_COMPANY;

  // Re-use an existing tracked job for the same sourceUrl so users
  // tracking the same listing don't create duplicates on the board.
  if (input.sourceUrl) {
    const [existing] = await db
      .select()
      .from(jobItems)
      .where(eq(jobItems.sourceUrl, input.sourceUrl))
      .limit(1);
    if (existing) {
      await db.insert(savedJobs).values({ userId, jobId: existing.id }).onConflictDoNothing();
      return rowToJob(existing);
    }
  }

  const [row] = await db
    .insert(jobItems)
    .values({
      postedByUserId: userId,
      title: input.title.slice(0, 250) || "Tracked Job",
      description: input.description ?? "",
      company,
      location: input.location,
      isRemote: input.isRemote ?? false,
      isActive: true,
      sourceUrl: input.sourceUrl,
    } as any)
    .returning();

  if (row) {
    await db.insert(savedJobs).values({ userId, jobId: row.id }).onConflictDoNothing();
  }

  return rowToJob(row!);
}

export async function updateJob(
  id: string,
  jobData: Partial<CreateJobDTO>,
  userId: string,
): Promise<JobEntity | null> {
  const db = getDb();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (jobData.title !== undefined) updates.title = jobData.title;
  if (jobData.description !== undefined) updates.description = jobData.description;
  if (jobData.location !== undefined) updates.location = jobData.location;

  const [row] = await db
    .update(jobItems)
    .set(updates)
    .where(and(eq(jobItems.id, id), eq((jobItems as any).postedByUserId, userId)))
    .returning();
  return row ? rowToJob(row) : null;
}

export async function deleteJob(id: string, userId: string): Promise<void> {
  const db = getDb();
  await db.delete(jobItems).where(and(eq(jobItems.id, id), eq((jobItems as any).postedByUserId, userId)));
}

export async function saveJob(jobId: string, userId: string): Promise<void> {
  const db = getDb();
  await db.insert(savedJobs).values({ userId, jobId }).onConflictDoNothing();
}

export async function unsaveJob(jobId: string, userId: string): Promise<void> {
  const db = getDb();
  await db.delete(savedJobs).where(and(eq(savedJobs.jobId, jobId), eq(savedJobs.userId, userId)));
}

export async function getSavedJobs(userId: string): Promise<JobEntity[]> {
  const db = getDb();
  const rows = await db
    .select({ job: jobItems })
    .from(savedJobs)
    .innerJoin(jobItems, eq(savedJobs.jobId, jobItems.id))
    .where(eq(savedJobs.userId, userId))
    .orderBy(desc(savedJobs.createdAt));
  return rows.map((r) => rowToJob(r.job));
}

export async function applyToJob(jobId: string, userId: string, application: ApplyJobDTO): Promise<void> {
  const db = getDb();
  await db.insert(jobApplications).values({
    userId,
    jobId,
    resumeId: application.resumeId as any,
    coverLetter: application.coverLetter,
    status: "applied",
  } as any);
}

export async function getApplications(userId: string) {
  const db = getDb();
  const rows = await db
    .select({ app: jobApplications, job: jobItems })
    .from(jobApplications)
    .leftJoin(jobItems, eq(jobApplications.jobId, jobItems.id))
    .where(eq(jobApplications.userId, userId))
    .orderBy(desc(jobApplications.appliedAt));
  return rows.map((r) => ({
    id: r.app.id,
    jobId: r.app.jobId,
    status: r.app.status,
    appliedAt: new Date(r.app.appliedAt).toISOString(),
    job: r.job ? rowToJob(r.job) : null,
  }));
}

export async function getJobBySlug(slug: string): Promise<JobEntity | null> {
  return getJobById(slug);
}

export async function getJobAlerts(userId: string) {
  const db = getDb();
  return db.select().from(jobAlerts).where(eq(jobAlerts.userId, userId)).orderBy(desc(jobAlerts.createdAt));
}

export async function createJobAlert(
  userId: string,
  data: { name: string; keywords?: string; location?: string; jobType?: string; frequency?: string },
) {
  const db = getDb();
  const [row] = await db
    .insert(jobAlerts)
    .values({
      userId,
      name: data.name,
      keywords: data.keywords,
      location: data.location,
      jobType: data.jobType,
      frequency: data.frequency ?? "weekly",
    } as any)
    .returning();
  return row!;
}

export async function updateJobAlert(
  id: string,
  userId: string,
  data: Partial<{ name: string; keywords: string; location: string; frequency: string; isActive: boolean }>,
) {
  const db = getDb();
  const [row] = await db
    .update(jobAlerts)
    .set({ ...data, updatedAt: new Date() } as any)
    .where(and(eq(jobAlerts.id, id), eq(jobAlerts.userId, userId)))
    .returning();
  return row ?? null;
}

export async function toggleJobAlert(id: string, userId: string) {
  const db = getDb();
  const [current] = await db
    .select({ isActive: jobAlerts.isActive })
    .from(jobAlerts)
    .where(and(eq(jobAlerts.id, id), eq(jobAlerts.userId, userId)))
    .limit(1);
  if (!current) return null;
  const [row] = await db
    .update(jobAlerts)
    .set({ isActive: !current.isActive, updatedAt: new Date() } as any)
    .where(and(eq(jobAlerts.id, id), eq(jobAlerts.userId, userId)))
    .returning();
  return row ?? null;
}

export async function deleteJobAlert(id: string, userId: string): Promise<void> {
  const db = getDb();
  await db.delete(jobAlerts).where(and(eq(jobAlerts.id, id), eq(jobAlerts.userId, userId)));
}
