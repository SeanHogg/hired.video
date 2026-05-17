import { Hono } from "hono";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { success } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { buildRepos } from "../repositories/index.js";
import { getPublicJobs, getHiredVideoCommunityCompanyId, JobEntity } from "../services/job/JobService.js";
import { servicesProcessor } from "../domains/services-processing/index.js";
import { UPGRADE_URL } from "../../../shared/tier-copy.js";

const { companyProfiles, users, userProfiles, resumeInformation, studioVoiceClones, studioTemplates, videos } = schema;

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
  const hq = company.headquarters;
  const location = hq
    ? [hq.city, hq.state, hq.country].filter(Boolean).join(", ") || hq.address || null
    : null;
  return {
    id: company.id,
    type: "company" as const,
    title: company.name,
    name: company.name,
    description: company.description,
    industry: company.industry,
    location,
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
    role: user.role,
    avatar: profile?.avatarUrl ?? undefined,
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
    // privacyLevel: 0=public, 1=recruiter-only, 2=connections, 10=private.
    // The search endpoint is anonymous, so anything returned here is public by definition.
    isPublic: resume.privacyLevel === 0,
    privacyLevel: resume.privacyLevel,
    templateName: "Default",
    createdAt: resume.createdAt.toISOString(),
    updatedAt: resume.updatedAt.toISOString(),
  };
}

function toVoiceItem(clone: typeof studioVoiceClones.$inferSelect) {
  // Voice clone listings appear in the homepage media catalog as type "voice".
  // The cart consumes priceCents directly via the embedded `voice` field.
  return {
    id: clone.id,
    type: "voice" as const,
    title: clone.name,
    name: clone.name,
    description: clone.description ?? "",
    summary: clone.description ?? "",
    createdAt: clone.createdAt.toISOString(),
    updatedAt: clone.updatedAt.toISOString(),
    voice: {
      id: clone.id,
      previewAudioUrl: clone.previewAudioUrl ?? null,
      priceCents: clone.priceCents,
      currency: clone.currency,
      language: clone.language ?? null,
      gender: clone.gender ?? null,
      accent: clone.accent ?? null,
      listingSlug: clone.listingSlug ?? null,
      creatorId: clone.userId,
      playCount: clone.playCount,
      purchaseCount: clone.purchaseCount,
    },
  };
}

function toTemplateItem(
  t: typeof studioTemplates.$inferSelect,
  hvCommunityCompanyId: string | null,
) {
  // Marketplace card payload. The cart consumes priceCents directly via the
  // embedded `template` field, mirroring how voice clones expose `voice`.
  // `firstParty` flags templates owned by the Hired.VIDEO Community company
  // so the marketplace can render a platform-shipped badge / filter pill.
  const firstParty = Boolean(
    t.companyId && hvCommunityCompanyId && t.companyId === hvCommunityCompanyId,
  );
  return {
    id: t.id,
    type: "template" as const,
    title: t.name,
    name: t.name,
    description: t.description ?? "",
    summary: t.description ?? "",
    avatar: t.thumbnailUrl ?? undefined,
    createdAt: (t.publishedAt ?? t.createdAt).toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    isFeatured: firstParty,
    template: {
      kind: "studio" as const,
      id: t.id,
      slug: t.listingSlug ?? null,
      thumbnailUrl: t.thumbnailUrl ?? null,
      previewVideoUrl: t.previewVideoUrl ?? null,
      priceCents: t.priceCents,
      currency: t.currency,
      durationSec: t.durationSec ?? null,
      motion: t.motion ?? null,
      language: t.language ?? null,
      tags: (t.tags as string[]) ?? [],
      creatorId: t.creatorId,
      companyId: t.companyId ?? null,
      firstParty,
      viewCount: t.viewCount,
      purchaseCount: t.purchaseCount,
    },
  };
}

function toMediaItem(video: typeof videos.$inferSelect, ownerName: string | null) {
  const title = video.title || `${ownerName ?? "Unknown"}'s Video Resume`;
  return {
    id: video.id,
    type: "media" as const,
    title,
    name: title,
    description: video.description ?? "",
    summary: video.description ?? "Video Resume",
    // Frontend media mapper reads these overloaded fields:
    skills: "video",           // metaType
    location: video.userId,    // ownerId
    company: video.resumeId,   // resumeId reference
    experienceLevel: video.youtubeUrl ?? (video.r2Key ? `/cdn/${video.r2Key}` : null), // mediaUrl
    avatar: video.thumbnailUrl, // thumbnail
    createdAt: video.createdAt.toISOString(),
    isFeatured: false,
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
  const employmentType = c.req.query("employmentType") || undefined;
  const experienceLevel = c.req.query("experienceLevel") || undefined;
  const isRemoteParam = c.req.query("isRemote");
  const isRemote = isRemoteParam === "true" ? true : isRemoteParam === "false" ? false : undefined;
  const salaryMin = c.req.query("salaryMin") ? Number(c.req.query("salaryMin")) : undefined;
  const salaryMax = c.req.query("salaryMax") ? Number(c.req.query("salaryMax")) : undefined;

  const includeJobs = category === "all" || category === "jobs";
  const includeCompanies = category === "all" || category === "companies";
  const includePeople = category === "all" || category === "people";
  const includeResumes = category === "all" || category === "resumes";
  const includeVoices = category === "all" || category === "voices";
  const includeMedia = category === "all" || category === "media";
  const includeTemplates = category === "all" || category === "templates";

  const jobsPromise = includeJobs
    ? getPublicJobs({
        page: 1,
        limit: 100,
        search: search || undefined,
        location: location || undefined,
        employmentType,
        experienceLevel,
        isRemote,
        salaryMin,
        salaryMax,
      })
    : Promise.resolve({ items: [], total: 0, page: 1, limit: 0, totalPages: 0, hasNext: false, hasPrev: false });

  const db = getDb();

  // Companies: only list active profiles (soft-delete / hidden companies stay out).
  const companyActiveClause = eq(companyProfiles.isActive, true);
  const companyWhere = search
    ? and(
        companyActiveClause,
        or(ilike(companyProfiles.name, `%${search}%`), ilike(companyProfiles.description, `%${search}%`)),
      )
    : companyActiveClause;
  const companyPromise = includeCompanies
    ? db
        .select()
        .from(companyProfiles)
        .where(companyWhere)
        .orderBy(desc(companyProfiles.createdAt))
        .limit(100)
    : Promise.resolve([] as typeof companyProfiles.$inferSelect[]);

  // People: only list users whose profileVisibility is "public" AND whose email
  // is verified. Users without a profile row are excluded because profile is
  // required to enforce visibility. The emailVerified gate keeps unverified
  // signups (a common spam vector) out of the public directory until they prove
  // ownership of the email address.
  const peopleVisibilityClause = and(
    eq(userProfiles.profileVisibility, "public"),
    eq(users.emailVerified, true),
  );
  const peopleWhere = search
    ? and(
        peopleVisibilityClause,
        or(ilike(users.name, `%${search}%`), ilike(users.email, `%${search}%`)),
      )
    : peopleVisibilityClause;
  const peoplePromise = includePeople
    ? db
        .select({ user: users, profile: userProfiles })
        .from(users)
        .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
        .where(peopleWhere)
        .orderBy(desc(users.createdAt))
        .limit(100)
    : Promise.resolve([] as Array<{ user: typeof users.$inferSelect; profile: typeof userProfiles.$inferSelect | null }>);

  // Resumes: ONLY return resumes with privacyLevel=0 (public). Everything else
  // (recruiter-only, connections, private, draft) must be invisible on the public
  // search surface — this endpoint is anonymous. Goes through
  // ResumeRepository.searchPublicByTitle so resume-table access stays at
  // one seam; the repo enforces the privacy filter internally.
  const resumesPromise = includeResumes
    ? buildRepos(db).resumes.searchPublicByTitle(search ?? "", 100)
    : Promise.resolve([] as typeof resumeInformation.$inferSelect[]);

  // Voice marketplace listings — only public clones; rank by recency.
  const voicesWhere = search
    ? and(eq(studioVoiceClones.visibility, "public"), or(
        ilike(studioVoiceClones.name, `%${search}%`),
        ilike(studioVoiceClones.description, `%${search}%`),
      ))
    : eq(studioVoiceClones.visibility, "public");
  const voicesPromise = includeVoices
    ? db
        .select()
        .from(studioVoiceClones)
        .where(voicesWhere)
        .orderBy(desc(studioVoiceClones.createdAt))
        .limit(100)
    : Promise.resolve([] as typeof studioVoiceClones.$inferSelect[]);

  // Studio template marketplace listings — only public templates; rank by
  // most recently published. Mirrors the voice clone path above.
  // `?firstParty=true` narrows to templates owned by the Hired.VIDEO
  // Community company (platform-shipped). The flag is also surfaced on
  // every template item via toTemplateItem so the frontend can render a
  // badge without needing a second round-trip.
  const firstPartyOnly = c.req.query("firstParty") === "true";
  const hvCommunityCompanyId = await getHiredVideoCommunityCompanyId();
  const templatesWhereParts = [eq(studioTemplates.visibility, "public")];
  if (search) {
    templatesWhereParts.push(or(
      ilike(studioTemplates.name, `%${search}%`),
      ilike(studioTemplates.description, `%${search}%`),
    )!);
  }
  if (firstPartyOnly && hvCommunityCompanyId) {
    templatesWhereParts.push(eq(studioTemplates.companyId, hvCommunityCompanyId));
  }
  const templatesWhere = templatesWhereParts.length === 1 ? templatesWhereParts[0] : and(...templatesWhereParts);
  const templatesPromise = includeTemplates
    ? db
        .select()
        .from(studioTemplates)
        .where(templatesWhere)
        .orderBy(desc(studioTemplates.publishedAt))
        .limit(100)
    : Promise.resolve([] as typeof studioTemplates.$inferSelect[]);

  // Media (public video resumes)
  const mediaWhere = search
    ? and(
        eq(videos.privacyStatus, "public"),
        or(ilike(videos.title, `%${search}%`), ilike(videos.description, `%${search}%`)),
      )
    : eq(videos.privacyStatus, "public");
  const mediaPromise = includeMedia
    ? db
        .select({ video: videos, ownerName: users.name })
        .from(videos)
        .innerJoin(users, eq(videos.userId, users.id))
        .where(mediaWhere)
        .orderBy(desc(videos.createdAt))
        .limit(100)
    : Promise.resolve([] as Array<{ video: typeof videos.$inferSelect; ownerName: string | null }>);

  const [jobs, companies, people, resumes, voices, templates, media] = await Promise.all([
    jobsPromise,
    companyPromise,
    peoplePromise,
    resumesPromise,
    voicesPromise,
    templatesPromise,
    mediaPromise,
  ]);

  // When searching "all", we merge and paginate by createdAt.
  const items = [
    ...jobs.items.map(toSearchItem),
    ...companies.map(toCompanyItem),
    ...people.map(({ user, profile }) => toPeopleItem(user, profile ?? null)),
    ...resumes.map(toResumeItem),
    ...voices.map(toVoiceItem),
    ...templates.map((t) => toTemplateItem(t, hvCommunityCompanyId)),
    ...media.map(({ video, ownerName }) => toMediaItem(video, ownerName)),
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

// ─── Boolean / Advanced Recruiter Search ─────────────────────────────────────
// POST /api/search/recruiter
// Supports: Boolean operators (AND / OR / NOT), quoted phrases, skill filters,
// experience level, location, and saved-search CRUD.
//
// Boolean string examples:
//   "React AND TypeScript"
//   "Python OR Django NOT intern"
//   "(product manager OR PM) AND SaaS"

const { savedSearches } = schema as any;

/** Convert a human-written Boolean string into a PostgreSQL tsquery expression. */
function booleanToTsquery(input: string): string {
  // Normalise whitespace
  let q = input.trim();
  if (!q) return "";

  // Quoted phrases → phrase tokens for pg to_tsquery
  q = q.replace(/"([^"]+)"/g, (_m, phrase) => phrase.trim().split(/\s+/).join(" <-> "));

  // Boolean operators
  q = q
    .replace(/\bAND\b/g, " & ")
    .replace(/\bOR\b/g, " | ")
    .replace(/\bNOT\b/g, " !")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Wrap bare words with wildcards (prefix matching)
  q = q.replace(/\b([a-zA-Z0-9_]+)\b(?!\s*[:|&!])/g, "$1:*");

  return q;
}

const RecruiterSearchSchema = z.object({
  query: z.string().max(500).default(""),
  skills: z.array(z.string()).default([]),
  location: z.string().max(200).optional(),
  experienceLevel: z.enum(["entry", "mid", "senior", "lead", "executive"]).optional(),
  role: z.string().max(100).optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

searchRoutes.post("/recruiter", async (c) => {
  const userId = c.var.user?.sub;
  const body = await c.req.json().catch(() => ({}));
  const parsed = RecruiterSearchSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: { code: "VALIDATION_ERROR" } }, 400);

  const { query, skills, location, experienceLevel, page, limit } = parsed.data;
  const offset = (page - 1) * limit;
  const db = getDb();

  // Build WHERE conditions
  const conditions: ReturnType<typeof sql>[] = [];

  if (query.trim()) {
    const tsQuery = booleanToTsquery(query);
    if (tsQuery) {
      conditions.push(sql`
        to_tsvector('english', coalesce(${users.name}, '') || ' ' ||
          coalesce((SELECT string_agg(coalesce(e->>'title','') || ' ' || coalesce(e->>'company',''), ' ')
                    FROM jsonb_array_elements(coalesce((SELECT work_experience FROM user_profiles WHERE user_id = ${users.id}), '[]'::jsonb)) e), ''))
        @@ to_tsquery('english', ${tsQuery})
      `);
    }
  }

  if (skills.length > 0) {
    for (const skill of skills) {
      conditions.push(sql`EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(coalesce(
          (SELECT skills FROM user_profiles WHERE user_id = ${users.id}), '[]'::jsonb)
        ) s WHERE lower(s) LIKE ${"%" + skill.toLowerCase() + "%"}
      )`);
    }
  }

  if (location) {
    conditions.push(ilike(userProfiles.location, `%${location}%`));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countRows, candidateRows] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(users).leftJoin(userProfiles, eq(userProfiles.userId, users.id)).where(whereClause),
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        headline: userProfiles.headline,
        location: userProfiles.location,
        avatarUrl: userProfiles.avatarUrl,
      })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset),
  ]);

  const total = countRows[0]?.count ?? 0;
  return c.json(
    success({
      candidates: candidateRows,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      hasNextPage: offset + limit < total,
    }),
    200,
  );
});

// ─── Saved Searches ──────────────────────────────────────────────────────────
// GET  /api/search/saved       — list user's saved searches
// POST /api/search/saved       — save a search
// DELETE /api/search/saved/:id — delete

const SavedSearchSchema = z.object({
  name: z.string().min(1).max(100),
  query: z.string().max(500),
  filters: z.record(z.string(), z.any()).default({}),
  searchType: z.enum(["recruiter", "jobs", "people", "companies"]).default("recruiter"),
});

searchRoutes.get("/saved", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json({ error: { code: "UNAUTHORIZED" } }, 401);
  const db = getDb();

  if (!savedSearches) {
    return c.json(success([]), 200);
  }

  const rows = await db
    .select()
    .from(savedSearches)
    .where(eq(savedSearches.userId, userId))
    .orderBy(desc(savedSearches.createdAt));

  return c.json(success(rows), 200);
});

searchRoutes.post("/saved", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json({ error: { code: "UNAUTHORIZED" } }, 401);
  const body = await c.req.json().catch(() => ({}));
  const parsed = SavedSearchSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: { code: "VALIDATION_ERROR" } }, 400);

  // Closes gap-register #766: enforce Free-tier 3-saved-search cap that was
  // previously marketing-only on the Pricing page.
  const gate = await servicesProcessor.gate({ user: c.var.user, eventType: "saved_search" });
  if (!gate.allowed) {
    return c.json(
      {
        success: false,
        error: {
          code: "ENTITLEMENT_EXCEEDED",
          message: gate.reason ?? `Saved searches limited to ${gate.cap} on the Free plan`,
          upgradeUrl: UPGRADE_URL,
          cap: gate.cap,
          consumed: gate.consumed,
        },
      },
      402,
    );
  }

  const db = getDb();

  if (!savedSearches) {
    // Schema not yet migrated — return the data as-is
    return c.json(success({ id: crypto.randomUUID(), userId, ...parsed.data, createdAt: new Date().toISOString() }), 201);
  }

  const [row] = (await db
    .insert(savedSearches)
    .values({ userId, ...parsed.data } as any)
    .returning()) as any[];

  await servicesProcessor
    .meter({ userId, eventType: "saved_search", metadata: { id: row?.id } })
    .catch((err) => console.warn("[search] meter saved_search failed:", err));

  return c.json(success(row), 201);
});

searchRoutes.delete("/saved/:id", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json({ error: { code: "UNAUTHORIZED" } }, 401);
  const id = c.req.param("id");
  const db = getDb();

  if (!savedSearches) return c.json(success(true), 200);

  await db.delete(savedSearches).where(and(eq(savedSearches.id, id), eq(savedSearches.userId, userId)));
  return c.json(success(true), 200);
});

// Fallback for other search routes (not implemented)
searchRoutes.all("*", (c) =>
  c.json(
    { error: { code: "NOT_IMPLEMENTED", message: "Search routes coming soon" } },
    501,
  ),
);
