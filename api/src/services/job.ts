import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import type {
  ApplyJobDTO,
  CreateJobDTO,
  JobSummaryDTO,
  PaginatedJobsDTO,
} from "../../../shared/job.js";

const { jobItems, savedJobs, jobApplications, jobAlerts } = schema;

export interface JobQuery {
  page?: number;
  limit?: number;
  search?: string;
  location?: string;
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

  const whereClause = and(
    eq(jobItems.isActive, true),
    filters?.search
      ? or(
          ilike(jobItems.title, `%${filters.search}%`),
          ilike(jobItems.description, `%${filters.search}%`),
          ilike(jobItems.company, `%${filters.search}%`),
        )
      : undefined,
    filters?.location ? ilike(jobItems.location, `%${filters.location}%`) : undefined,
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
