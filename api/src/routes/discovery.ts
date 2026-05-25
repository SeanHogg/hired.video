// discovery.ts — Video discovery feed (#78), smart job board (#83),
//                creator/influencer mode (#82), SEO content engine (#81)

import { Hono } from "hono";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../services/adapters/llm-client.js";
import { getSubscription } from "../services/billing/BillingService.js";
import { scoreJobsForRanking } from "../services/job/ranking.js";
import {
  getPopularRoles,
  getPopularCities,
} from "../services/job/salary-popularity.js";

export const discoveryRoutes = new Hono<{ Variables: Variables }>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

// ============================================================================
// TikTok-style talent discovery feed (#78)
// Short video intros, algorithmic candidate surfacing for recruiters.
// ============================================================================

/**
 * GET /api/discovery/talent-feed
 * Returns a ranked list of candidate video profiles for recruiter discovery.
 * Query: ?limit=20 &cursor= (offset-based pagination) &skills= &location=
 */
discoveryRoutes.get("/talent-feed", async (c) => {
  const db = getDb();
  const limit = Math.min(50, Math.max(1, Number(c.req.query("limit") ?? 20)));
  const offset = Math.max(0, Number(c.req.query("cursor") ?? 0));
  const skillFilter = c.req.query("skills")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  const location = c.req.query("location")?.trim() ?? "";

  // Base query: users with profile videos. We read videoResumeUrl from
  // the userProfiles fallback below; no separate join table is needed
  // (the legacy `video_resumes` table was dropped in migration 0062).
  const profileTable = (schema as any).userProfiles ?? null;
  const usersTable = (schema as any).users ?? null;
  if (!profileTable || !usersTable) return c.json(success({ items: [], nextCursor: null }), 200);

  const rows = await db
    .select({
      userId: profileTable.userId,
      headline: profileTable.headline,
      location: profileTable.location,
      avatarUrl: profileTable.avatarUrl,
      skills: profileTable.skills,
      videoResumeUrl: profileTable.videoResumeUrl ?? sql`null`,
      updatedAt: profileTable.updatedAt,
    })
    .from(profileTable)
    // Join users so we can require emailVerified — keeps unverified spam
    // signups out of the recruiter-facing talent feed.
    .innerJoin(usersTable, eq(usersTable.id, profileTable.userId))
    // profileVisibility: "public" means the user opted into public discovery feeds.
    // Anything else (private, connections) must never surface here.
    .where(and(eq(profileTable.profileVisibility, "public"), eq(usersTable.emailVerified, true)))
    .orderBy(desc(profileTable.updatedAt))
    .limit(limit)
    .offset(offset)
    .catch(() => []);

  // Apply client-side skill filter if needed (DB-level would use GIN index)
  const filtered = skillFilter.length
    ? rows.filter((r: any) => {
        const skills = Array.isArray(r.skills) ? r.skills : [];
        return skillFilter.some((s) => skills.some((rs: string) => rs.toLowerCase().includes(s.toLowerCase())));
      })
    : rows;

  // Score: video present → boost
  const scored = filtered.map((r: any) => ({
    ...r,
    score: (r.videoResumeUrl ? 30 : 0) + (r.headline ? 15 : 0) + (r.location ? 10 : 0) + Math.floor(Math.random() * 20),
  })).sort((a: any, b: any) => b.score - a.score);

  return c.json(success({
    items: scored,
    nextCursor: rows.length === limit ? offset + limit : null,
  }), 200);
});

/**
 * GET /api/discovery/talent-feed/:userId — single candidate video card
 */
discoveryRoutes.get("/talent-feed/:userId", async (c) => {
  const db = getDb();
  const profileTable = (schema as any).userProfiles ?? null;
  const usersTable = (schema as any).users ?? null;
  if (!profileTable || !usersTable) return c.json(error("NOT_FOUND", "Profile not found"), 404);

  const [row] = await db
    .select({ profile: profileTable, emailVerified: usersTable.emailVerified })
    .from(profileTable)
    .innerJoin(usersTable, eq(usersTable.id, profileTable.userId))
    .where(eq(profileTable.userId, c.req.param("userId")))
    .limit(1);

  // Treat unverified accounts as "not found" rather than 403 — we don't want to
  // leak the existence of a half-created account to an anonymous caller.
  if (!row || row.profile.profileVisibility !== "public" || !row.emailVerified) {
    return c.json(error("NOT_FOUND", "Profile not found"), 404);
  }
  return c.json(success(row.profile), 200);
});

// ============================================================================
// Smart job board layer (#83)
// AI match + rank across active listings. Aggregation stubs for external boards.
// ============================================================================

/**
 * GET /api/discovery/jobs — AI-ranked job board
 * Query: ?q= (natural language) &location= &limit= &remote=
 * Returns jobs ranked by match score derived from full-text relevance + recency.
 */
discoveryRoutes.get("/jobs", async (c) => {
  const db = getDb();
  const q = c.req.query("q")?.trim() ?? "";
  const location = c.req.query("location")?.trim() ?? "";
  const remote = c.req.query("remote") === "true";
  const limit = Math.min(50, Math.max(1, Number(c.req.query("limit") ?? 20)));

  const userId = uid(c);
  const isPro = userId ? (await getSubscription(userId)).isPro : false;

  const conditions: any[] = [eq(schema.jobItems.isActive, true)];
  if (remote) conditions.push(eq((schema.jobItems as any).isRemote ?? sql`true`, true));
  if (location && (schema.jobItems as any).location) {
    conditions.push(sql`lower(${(schema.jobItems as any).location}) like ${"%" + location.toLowerCase() + "%"}`);
  }

  const jobs = await db
    .select({
      id: schema.jobItems.id,
      title: schema.jobItems.title,
      description: schema.jobItems.description,
      company: schema.jobItems.company,
      location: (schema.jobItems as any).location,
      salaryMin: (schema.jobItems as any).salaryMin,
      salaryMax: (schema.jobItems as any).salaryMax,
      createdAt: schema.jobItems.createdAt,
      sponsored: schema.jobItems.sponsored,
      sponsoredRankBoost: schema.jobItems.sponsoredRankBoost,
    })
    .from(schema.jobItems)
    .where(and(...conditions))
    .orderBy(desc(schema.jobItems.createdAt))
    .limit(isPro ? 200 : 100)
    .catch(() => []);

  const ranked = scoreJobsForRanking(jobs as any, q, isPro);

  return c.json(success({
    items: ranked.slice(0, limit).map(({ _score: _, sponsored: __, sponsoredRankBoost: ___, ...j }: any) => j),
    total: ranked.length,
    query: q,
    priorityRanked: isPro,
  }), 200);
});

/**
 * GET /api/discovery/jobs/:id/similar — "More like this" recommendations
 */
discoveryRoutes.get("/jobs/:id/similar", async (c) => {
  const db = getDb();
  const [job] = await db
    .select({ title: schema.jobItems.title, company: schema.jobItems.company })
    .from(schema.jobItems)
    .where(eq(schema.jobItems.id, c.req.param("id")))
    .limit(1);

  if (!job) return c.json(error("NOT_FOUND", "Job not found"), 404);

  const titleWords = String(job.title ?? "").toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const similar = await db
    .select({ id: schema.jobItems.id, title: schema.jobItems.title, company: schema.jobItems.company, createdAt: schema.jobItems.createdAt })
    .from(schema.jobItems)
    .where(and(
      eq(schema.jobItems.isActive, true),
      titleWords.length ? sql`lower(${schema.jobItems.title}) like ${"%" + titleWords[0] + "%"}` : sql`true`,
    ))
    .orderBy(desc(schema.jobItems.createdAt))
    .limit(6);

  return c.json(success(similar.filter((j) => j.id !== c.req.param("id")).slice(0, 5)), 200);
});

// ============================================================================
// SEO content engine (#81)
// AI-generated pages: "Best resume for [job title]", "Salary for [role]", etc.
// ============================================================================

/**
 * GET /api/discovery/seo/resume-guide/:jobSlug
 * Returns AI-generated career guide for a specific job title.
 * Cached in feed for 24h (TTL enforced by Cloudflare Cache API or CDN).
 */
discoveryRoutes.get("/seo/resume-guide/:jobSlug", async (c) => {
  const jobSlug = c.req.param("jobSlug").replace(/-/g, " ");

  let content = {
    jobTitle: jobSlug,
    headline: `How to Write a Resume for ${jobSlug} Roles`,
    introduction: `Landing a ${jobSlug} position requires a targeted resume that showcases the right skills and experience.`,
    keySkills: ["Communication", "Problem-solving", "Relevant technical expertise"],
    resumeTips: [
      `Tailor your summary to highlight ${jobSlug}-specific achievements`,
      "Quantify your impact with metrics where possible",
      "Include keywords from the job description",
    ],
    commonMistakes: ["Generic objective statements", "Missing measurable outcomes"],
    salaryRange: { min: 50000, max: 120000, currency: "USD", source: "hired.video data" },
    generatedAt: new Date().toISOString(),
  };

  if (hasAnyLLMProviderKey(c.env as any)) {
    try {
      const prompt = `Create a career guide JSON for job title "${jobSlug}". Include:
- headline (string)
- introduction (2 sentences)
- keySkills (array of 5-7 skills)
- resumeTips (array of 4 tips specific to this role)
- commonMistakes (array of 3 mistakes)
- salaryRange { min, max, currency, note }

Return ONLY valid JSON.`;
      const llm = createLLMClient(c.env as any, c.var.user);
      const { content: raw } = await llm.callText("discovery_career_guide", { useCase: "discovery", systemPrompt: "", userMessage: prompt });
      const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
      if (parsed.headline) content = { ...content, ...parsed, jobTitle: jobSlug, generatedAt: new Date().toISOString() };
    } catch { /* use defaults */ }
  }

  // Set cache headers for CDN/Cloudflare
  c.header("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600");
  return c.json(success(content), 200);
});

/**
 * GET /api/discovery/seo/salary-index
 * Returns the popular roles + cities used to seed the /salary index page
 * and the city × role programmatic SEO grid. Public, cached.
 */
discoveryRoutes.get("/seo/salary-index", async (c) => {
  const roles = await getPopularRoles(50);
  const cities = await getPopularCities(30);
  c.header("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  return c.json(success({ roles, cities }), 200);
});

/**
 * Shared handler for /seo/salary/:jobSlug and /seo/salary/:jobSlug/:locationSlug.
 *
 * Aggregates salary_min / salary_max from active jobs matching the role
 * slug (LIKE match against the lowercased title) and — when a
 * location slug is provided — additionally constrains by a LIKE match
 * against the free-text `location` column. The city slug is converted
 * back to a search token (`san-francisco` → `san francisco`) which
 * tolerates the most common formats in scraped job feeds
 * ("San Francisco, CA", "San Francisco Bay Area", "San Francisco — Remote").
 *
 * Returns related-cities + related-roles when no location constraint is
 * active, so the page can render Glassdoor-style internal linking.
 */
async function handleSalaryQuery(c: any) {
  const jobSlugRaw = c.req.param("jobSlug") as string;
  const locationSlugRaw = (c.req.param("locationSlug") as string | undefined) ?? null;
  const jobSlug = jobSlugRaw.replace(/-/g, " ").toLowerCase();
  const locationToken = locationSlugRaw?.replace(/-/g, " ").toLowerCase() ?? null;
  const db = getDb();

  const whereClauses = [
    eq(schema.jobItems.isActive, true),
    sql`lower(${schema.jobItems.title}) like ${"%" + jobSlug + "%"}`,
  ];
  if (locationToken) {
    whereClauses.push(
      sql`lower(${schema.jobItems.location}) like ${"%" + locationToken + "%"}`,
    );
  }

  const rows = await db
    .select({
      salaryMin: (schema.jobItems as any).salaryMin,
      salaryMax: (schema.jobItems as any).salaryMax,
    })
    .from(schema.jobItems)
    .where(and(...whereClauses))
    .limit(200)
    .catch(() => []);

  const salaries = rows
    .flatMap((r: any) => [r.salaryMin, r.salaryMax])
    .map((v: any) => (typeof v === "string" ? Number(v) : v))
    .filter((s: any): s is number => typeof s === "number" && Number.isFinite(s) && s > 0);

  const avg = salaries.length
    ? Math.round(salaries.reduce((a, b) => a + b, 0) / salaries.length)
    : null;
  const min = salaries.length ? Math.min(...salaries) : null;
  const max = salaries.length ? Math.max(...salaries) : null;

  // Related links — only when not already drilled down (the location
  // page links back to cities, the role page links forward to cities;
  // both link to related roles).
  const [relatedCities, relatedRoles] = await Promise.all([
    locationSlugRaw ? Promise.resolve([]) : getPopularCities(12),
    getPopularRoles(50).then((roles) =>
      roles
        .filter((r) => r.slug !== jobSlugRaw && r.title !== jobSlug)
        .slice(0, 8),
    ),
  ]);

  c.header("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  return c.json(
    success({
      jobTitle: jobSlug,
      jobSlug: jobSlugRaw,
      location: locationToken,
      locationSlug: locationSlugRaw,
      currency: "USD",
      averageSalary: avg,
      minSalary: min,
      maxSalary: max,
      sampleSize: rows.length,
      relatedCities,
      relatedRoles,
      lastUpdated: new Date().toISOString(),
    }),
    200,
  );
}

/**
 * GET /api/discovery/seo/salary/:jobSlug
 * GET /api/discovery/seo/salary/:jobSlug/:locationSlug
 */
discoveryRoutes.get("/seo/salary/:jobSlug", handleSalaryQuery);
discoveryRoutes.get("/seo/salary/:jobSlug/:locationSlug", handleSalaryQuery);

/**
 * GET /api/discovery/companies/top-rated
 * Companies ranked by review aggregate. Powers the "Top reviewed companies"
 * surface on Companies.tsx, the homepage, and the reviews-section of
 * sitemap.xml. Filters out companies with too few reviews so a single
 * 5-star drive-by doesn't tank the signal — minimum threshold mirrors
 * Glassdoor's "trusted reviews" cutoff.
 *
 * Public (no auth). Cached for an hour at the CDN.
 */
discoveryRoutes.get("/companies/top-rated", async (c) => {
  const db = getDb();
  const limit = Math.min(50, Math.max(1, Number(c.req.query("limit") ?? 12)));
  const minReviews = Math.max(1, Number(c.req.query("minReviews") ?? 3));

  const rows = await db
    .select({
      id: schema.companyProfiles.id,
      slug: schema.companyProfiles.slug,
      name: schema.companyProfiles.name,
      logo: (schema.companyProfiles as any).logo ?? sql`null`,
      industry: (schema.companyProfiles as any).industry ?? sql`null`,
      reviewCount: (schema.companyProfiles as any).reviewCount,
      reviewAvgOverall: (schema.companyProfiles as any).reviewAvgOverall,
    })
    .from(schema.companyProfiles)
    .where(sql`${(schema.companyProfiles as any).reviewCount} >= ${minReviews}`)
    .orderBy(
      desc((schema.companyProfiles as any).reviewAvgOverall),
      desc((schema.companyProfiles as any).reviewCount),
    )
    .limit(limit)
    .catch(() => []);

  c.header("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  return c.json(
    success(
      rows.map((r: any) => ({
        ...r,
        reviewAvgOverall:
          typeof r.reviewAvgOverall === "string"
            ? Number(r.reviewAvgOverall)
            : r.reviewAvgOverall,
      })),
    ),
    200,
  );
});

// ============================================================================
// Creator / influencer mode (#82)
// Build audiences, post career content, sell resume templates.
// ============================================================================

/**
 * GET /api/discovery/creators/leaderboard
 * Top creators by follower count / engagement on the feed.
 */
discoveryRoutes.get("/creators/leaderboard", async (c) => {
  const db = getDb();

  // Count feed post engagement per user
  const feedTable = (schema as any).feedPosts ?? null;
  if (!feedTable) return c.json(success([]), 200);

  const rows = await db
    .select({
      userId: feedTable.userId,
      postCount: sql<number>`count(*)::int`,
    })
    .from(feedTable)
    .groupBy(feedTable.userId)
    .orderBy(desc(sql`count(*)`))
    .limit(20)
    .catch(() => []);

  // Enrich with profile data
  const userIds = rows.map((r: any) => r.userId);
  const profiles = userIds.length
    ? await db
        .select({ userId: schema.users.id, name: schema.users.name, email: schema.users.email })
        .from(schema.users)
        .where(inArray(schema.users.id, userIds))
        .catch(() => [])
    : [];

  const profileMap = Object.fromEntries(profiles.map((p) => [p.userId, p.name]));

  return c.json(success(rows.map((r: any, i: number) => ({
    rank: i + 1,
    userId: r.userId,
    name: profileMap[r.userId] ?? "Anonymous",
    postCount: r.postCount,
  }))), 200);
});

/**
 * POST /api/discovery/creators/products
 * List a resume template or career resource for sale.
 * Body: { title, description, priceUsd, category, downloadUrl }
 */
discoveryRoutes.post("/creators/products", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => ({}));
  if (!body.title || !body.priceUsd) return c.json(error("VALIDATION_ERROR", "title and priceUsd are required"), 400);

  const db = getDb();
  const productsTable = (schema as any).creatorProducts ?? null;
  if (!productsTable) {
    // Graceful stub: store in marketingLeads as product listing signal
    await db.insert(schema.marketingLeads).values({
      email: `creator+${userId}@stub`,
      source: "creator_product",
      metadata: { title: body.title, priceUsd: body.priceUsd, creatorId: userId } as any,
    } as any).onConflictDoNothing().catch(() => undefined);
    return c.json(success({ id: `stub-${Date.now()}`, ...body, creatorId: userId, status: "pending_review" }), 201);
  }

  const [product] = (await db.insert(productsTable).values({
    creatorId: userId,
    title: body.title,
    description: body.description ?? null,
    priceUsd: body.priceUsd,
    category: body.category ?? "resume_template",
    downloadUrl: body.downloadUrl ?? null,
    status: "pending_review",
  } as any).returning()) as any[];

  return c.json(success(product), 201);
});

/**
 * GET /api/discovery/creators/products — browse marketplace
 */
discoveryRoutes.get("/creators/products", async (c) => {
  const db = getDb();
  const productsTable = (schema as any).creatorProducts ?? null;
  if (!productsTable) return c.json(success([]), 200);

  const rows = await db.select().from(productsTable)
    .where(eq(productsTable.status, "published"))
    .orderBy(desc(productsTable.createdAt))
    .limit(50)
    .catch(() => []);

  return c.json(success(rows), 200);
});

discoveryRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Discovery endpoint not found" } }, 404),
);
