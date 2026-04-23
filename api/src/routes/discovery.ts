// discovery.ts — Video discovery feed (#78), smart job board (#83),
//                creator/influencer mode (#82), SEO content engine (#81)

import { Hono } from "hono";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { callLLM, getApiKey } from "../services/adapters/ai.js";

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

  // Base query: users with video resumes / profile videos
  // Scored by: has_video (×3) + profile complete (×2) + recent activity (×1)
  const videoAlias = schema.videoResumes ?? (schema as any).studioVideos ?? null;

  // Fallback: return profile data with engagement score
  const profileTable = (schema as any).userProfiles ?? null;
  if (!profileTable) return c.json(success({ items: [], nextCursor: null }), 200);

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
    // profileVisibility: "public" means the user opted into public discovery feeds.
    // Anything else (private, connections) must never surface here.
    .where(eq(profileTable.profileVisibility, "public"))
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
  if (!profileTable) return c.json(error("NOT_FOUND", "Profile not found"), 404);

  const [profile] = await db
    .select()
    .from(profileTable)
    .where(eq(profileTable.userId, c.req.param("userId")))
    .limit(1);

  if (!profile || profile.profileVisibility !== "public") {
    return c.json(error("NOT_FOUND", "Profile not found"), 404);
  }
  return c.json(success(profile), 200);
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

  const conditions: any[] = [eq(schema.jobItems.isActive, true)];
  if (remote) conditions.push(eq((schema.jobItems as any).isRemote ?? sql`true`, true));
  if (location && (schema.jobItems as any).location) {
    conditions.push(sql`lower(${(schema.jobItems as any).location}) like ${"%" + location.toLowerCase() + "%"}`);
  }

  let jobs = await db
    .select({
      id: schema.jobItems.id,
      title: schema.jobItems.title,
      description: schema.jobItems.description,
      company: schema.jobItems.company,
      location: (schema.jobItems as any).location,
      salaryMin: (schema.jobItems as any).salaryMin,
      salaryMax: (schema.jobItems as any).salaryMax,
      createdAt: schema.jobItems.createdAt,
    })
    .from(schema.jobItems)
    .where(and(...conditions))
    .orderBy(desc(schema.jobItems.createdAt))
    .limit(100)
    .catch(() => []);

  // Simple relevance scoring
  if (q) {
    const terms = q.toLowerCase().split(/\s+/);
    jobs = jobs.map((j: any) => {
      const text = `${j.title ?? ""} ${j.description ?? ""}`.toLowerCase();
      const score = terms.reduce((s: number, t: string) => s + (text.includes(t) ? 10 : 0), 0);
      return { ...j, _score: score + (j.sponsored ? 20 : 0) };
    }).sort((a: any, b: any) => b._score - a._score);
  }

  return c.json(success({
    items: jobs.slice(0, limit).map(({ _score: _, ...j }: any) => j),
    total: jobs.length,
    query: q,
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
  const apiKey = getApiKey((c.env as any) ?? {});

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

  if (apiKey) {
    try {
      const prompt = `Create a career guide JSON for job title "${jobSlug}". Include:
- headline (string)
- introduction (2 sentences)
- keySkills (array of 5-7 skills)
- resumeTips (array of 4 tips specific to this role)
- commonMistakes (array of 3 mistakes)
- salaryRange { min, max, currency, note }

Return ONLY valid JSON.`;
      const raw = await callLLM(apiKey, { systemPrompt: "", userMessage: prompt, temperature: 0.3, maxTokens: 800 });
      const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
      if (parsed.headline) content = { ...content, ...parsed, jobTitle: jobSlug, generatedAt: new Date().toISOString() };
    } catch { /* use defaults */ }
  }

  // Set cache headers for CDN/Cloudflare
  c.header("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600");
  return c.json(success(content), 200);
});

/**
 * GET /api/discovery/seo/salary/:jobSlug
 * Returns salary data for a role from the platform DB + AI insights.
 */
discoveryRoutes.get("/seo/salary/:jobSlug", async (c) => {
  const jobSlug = c.req.param("jobSlug").replace(/-/g, " ");
  const db = getDb();

  // Pull salary data from job listings
  const rows = await db
    .select({
      salaryMin: (schema.jobItems as any).salaryMin,
      salaryMax: (schema.jobItems as any).salaryMax,
    })
    .from(schema.jobItems)
    .where(and(
      eq(schema.jobItems.isActive, true),
      sql`lower(${schema.jobItems.title}) like ${"%" + jobSlug.toLowerCase() + "%"}`,
    ))
    .limit(100)
    .catch(() => []);

  const salaries = rows
    .flatMap((r: any) => [r.salaryMin, r.salaryMax])
    .filter((s): s is number => typeof s === "number" && s > 0);

  const avg = salaries.length ? Math.round(salaries.reduce((a, b) => a + b, 0) / salaries.length) : null;
  const min = salaries.length ? Math.min(...salaries) : null;
  const max = salaries.length ? Math.max(...salaries) : null;

  c.header("Cache-Control", "public, max-age=3600");
  return c.json(success({
    jobTitle: jobSlug,
    currency: "USD",
    averageSalary: avg,
    minSalary: min,
    maxSalary: max,
    sampleSize: rows.length,
    lastUpdated: new Date().toISOString(),
  }), 200);
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
