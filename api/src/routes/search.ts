import { Hono } from "hono";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { Variables } from "../types/index.js";
import { success } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { getPublicJobs, JobEntity } from "../services/job.js";

const { companyProfiles, users, userProfiles, resumeInformation } = schema;

export const searchRoutes = new Hono<{ Variables: Variables }>();

function toSearchItem(job: JobEntity) {
  return {
    id: job.id,
    type: "job" as const,
    title: job.title,
    description: job.description,
    company: job.company,
    location: job.location,
    postedDate: job.postedDate,
    createdAt: job.createdAt,
    employmentType: job.employmentType,
    experienceLevel: job.experienceLevel,
    salary: job.salaryMin !== undefined && job.salaryMax !== undefined ? `${job.salaryMin}-${job.salaryMax}` : undefined,
    isFeatured: false,
  };
}

function toCompanyItem(company: typeof companyProfiles.$inferSelect) {
  return {
    id: company.id,
    type: "company" as const,
    title: company.name,
    name: company.name,
    description: company.description,
    industry: company.industry,
    location: company.headquarters,
    logo: company.logoUrl,
    size: company.size,
    founded: company.foundedYear ?? undefined,
    createdAt: company.createdAt.toISOString(),
    updatedAt: company.updatedAt.toISOString(),
  };
}

function toPeopleItem(user: typeof users.$inferSelect, profile?: typeof userProfiles.$inferSelect | null) {
  return {
    id: user.id,
    type: "people" as const,
    name: user.name,
    headline: profile?.headline ?? undefined,
    location: profile?.location ?? undefined,
    createdAt: user.createdAt?.toISOString(),
    updatedAt: user.updatedAt?.toISOString(),
  };
}

function toResumeItem(resume: typeof resumeInformation.$inferSelect) {
  return {
    id: resume.id,
    type: "resume" as const,
    title: resume.title,
    name: resume.title,
    isPublic: resume.status === "published",
    templateName: "Default",
    createdAt: resume.createdAt.toISOString(),
    updatedAt: resume.updatedAt.toISOString(),
  };
}

// Unified search endpoint used by frontend.
// Supports category filtering (jobs/people/companies/resumes) and a default "all".
searchRoutes.get("/public", async (c) => {
  const search = String(c.req.query("search") ?? "").trim();
  const category = String(c.req.query("category") ?? "all").toLowerCase();
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 20)));
  const location = String(c.req.query("location") ?? "").trim();

  const includeJobs = category === "all" || category === "jobs";
  const includeCompanies = category === "all" || category === "companies";
  const includePeople = category === "all" || category === "people";
  const includeResumes = category === "all" || category === "resumes";

  const jobsPromise = includeJobs
    ? getPublicJobs({ page: 1, limit: 100, search: search || undefined, location: location || undefined })
    : Promise.resolve({ items: [], total: 0, page: 1, limit: 0, totalPages: 0, hasNext: false, hasPrev: false });

  const db = getDb();

  const companyWhere = search
    ? or(ilike(companyProfiles.name, `%${search}%`), ilike(companyProfiles.description, `%${search}%`))
    : undefined;
  const companyPromise = includeCompanies
    ? db
        .select()
        .from(companyProfiles)
        .where(companyWhere)
        .orderBy(desc(companyProfiles.createdAt))
        .limit(100)
    : Promise.resolve([] as typeof companyProfiles.$inferSelect[]);

  const peopleWhere = search
    ? or(ilike(users.name, `%${search}%`), ilike(users.email, `%${search}%`))
    : undefined;
  const peoplePromise = includePeople
    ? db
        .select({ user: users, profile: userProfiles })
        .from(users)
        .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
        .where(peopleWhere)
        .orderBy(desc(users.createdAt))
        .limit(100)
    : Promise.resolve([] as Array<{ user: typeof users.$inferSelect; profile: typeof userProfiles.$inferSelect | null }>);

  const resumesWhere = search
    ? ilike(resumeInformation.title, `%${search}%`)
    : undefined;
  const resumesPromise = includeResumes
    ? db
        .select()
        .from(resumeInformation)
        .where(resumesWhere)
        .orderBy(desc(resumeInformation.createdAt))
        .limit(100)
    : Promise.resolve([] as typeof resumeInformation.$inferSelect[]);

  const [jobs, companies, people, resumes] = await Promise.all([
    jobsPromise,
    companyPromise,
    peoplePromise,
    resumesPromise,
  ]);

  // When searching "all", we merge and paginate by createdAt.
  const items = [
    ...jobs.items.map(toSearchItem),
    ...companies.map(toCompanyItem),
    ...people.map(({ user, profile }) => toPeopleItem(user, profile ?? null)),
    ...resumes.map(toResumeItem),
  ]
    .sort((a, b) => (new Date(b.createdAt).getTime() ?? 0) - (new Date(a.createdAt).getTime() ?? 0));

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  const pagedItems = items.slice(start, start + limit);

  return c.json(
    success({
      items: pagedItems,
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    }),
    200,
  );
});

// Fallback for other search routes (not implemented)
searchRoutes.all("*", (c) =>
  c.json(
    { error: { code: "NOT_IMPLEMENTED", message: "Search routes coming soon" } },
    501,
  ),
);
