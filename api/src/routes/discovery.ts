// discovery.ts — Video discovery feed (#78), smart job board (#83),
//                creator/influencer mode (#82), SEO content engine (#81)
//
// Handlers only parse input; reads live in services/discovery/{jobBoard,
// directory}.ts (which keep the search-cache / edge-cache wrappers).

import { Hono, type Context } from "hono";
import type { AppEnv } from "../types/index.js";
import { success } from "../types/index.js";
import { clampLimit } from "../utils/pagination.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../services/adapters/llm-client.js";
import { tryExtractJson } from "../../../shared/extract-json.js";
import { findSimilarJobs, getSalaryForRole, getSalaryIndex, rankJobBoard } from "../services/discovery/jobBoard.js";
import {
  getCreatorLeaderboard,
  getTalentCard,
  getTalentFeed,
  getTopRatedCompanies,
  listCreatorProducts,
  submitCreatorProduct,
  type CreatorProductInput,
} from "../services/discovery/directory.js";
import { requireUser } from "./helpers/routerHelpers.js";

export const discoveryRoutes = new Hono<AppEnv>();

const SEO_CACHE_CONTROL = "public, max-age=3600, stale-while-revalidate=86400";

// ============================================================================
// TikTok-style talent discovery feed (#78)
// Short video intros, algorithmic candidate surfacing for recruiters.
// ============================================================================

/**
 * GET /api/discovery/talent-feed
 * Returns a ranked list of candidate video profiles for recruiter discovery.
 * Query: ?limit=20 &cursor= (offset-based pagination) &skills=
 */
discoveryRoutes.get("/talent-feed", async (c) => {
  const limit = clampLimit(c.req.query("limit"), 20, 50);
  const offset = Math.max(0, Number(c.req.query("cursor") ?? 0));
  const skills = c.req.query("skills")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  return c.json(success(await getTalentFeed({ limit, offset, skills })), 200);
});

/**
 * GET /api/discovery/talent-feed/:userId — single candidate video card
 */
discoveryRoutes.get("/talent-feed/:userId", async (c) => {
  return c.json(success(await getTalentCard(c.req.param("userId"))), 200);
});

// ============================================================================
// Smart job board layer (#83)
// AI match + rank across active listings.
// ============================================================================

/**
 * GET /api/discovery/jobs — AI-ranked job board
 * Query: ?q= (natural language) &location= &limit= &remote=
 * Returns jobs ranked by match score derived from full-text relevance + recency.
 */
discoveryRoutes.get("/jobs", async (c) => {
  const result = await rankJobBoard({
    q: c.req.query("q")?.trim() ?? "",
    location: c.req.query("location")?.trim() ?? "",
    remote: c.req.query("remote") === "true",
    limit: clampLimit(c.req.query("limit"), 20, 50),
    viewerId: c.var.userId,
  });
  return c.json(success(result), 200);
});

/**
 * GET /api/discovery/jobs/:id/similar — "More like this" recommendations
 */
discoveryRoutes.get("/jobs/:id/similar", async (c) => {
  return c.json(success(await findSimilarJobs(c.req.param("id"))), 200);
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
      const parsed = tryExtractJson<Partial<typeof content>>(raw);
      if (parsed?.headline) content ={ ...content, ...parsed, jobTitle: jobSlug, generatedAt: new Date().toISOString() };
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
  const index = await getSalaryIndex();
  c.header("Cache-Control", SEO_CACHE_CONTROL);
  return c.json(success(index), 200);
});

/**
 * GET /api/discovery/seo/salary/:jobSlug
 * GET /api/discovery/seo/salary/:jobSlug/:locationSlug
 * Salary aggregate for a role (optionally one city) + related links.
 */
const salaryHandler = async (c: Context<AppEnv>) => {
  const result = await getSalaryForRole(c.req.param("jobSlug") ?? "", c.req.param("locationSlug") ?? null);
  c.header("Cache-Control", SEO_CACHE_CONTROL);
  return c.json(success(result), 200);
};
discoveryRoutes.get("/seo/salary/:jobSlug", salaryHandler);
discoveryRoutes.get("/seo/salary/:jobSlug/:locationSlug", salaryHandler);

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
  const limit = clampLimit(c.req.query("limit"), 12, 50);
  const minReviews = Math.max(1, Number(c.req.query("minReviews") ?? 3));
  const rows = await getTopRatedCompanies(minReviews, limit);
  c.header("Cache-Control", SEO_CACHE_CONTROL);
  return c.json(success(rows), 200);
});

// ============================================================================
// Creator / influencer mode (#82)
// Build audiences, post career content, sell resume templates.
// ============================================================================

/**
 * GET /api/discovery/creators/leaderboard
 * Top creators by feed post count (edge-cached 300s).
 */
discoveryRoutes.get("/creators/leaderboard", async (c) => {
  return c.json(success(await getCreatorLeaderboard()), 200);
});

/**
 * POST /api/discovery/creators/products
 * List a resume template or career resource for sale.
 * Body: { title, description, priceUsd, category, downloadUrl }
 */
discoveryRoutes.post("/creators/products", async (c) => {
  const userId = requireUser(c);
  const body = (await c.req.json().catch(() => ({}))) as CreatorProductInput;
  return c.json(success(await submitCreatorProduct(userId, body)), 201);
});

/**
 * GET /api/discovery/creators/products — browse marketplace
 */
discoveryRoutes.get("/creators/products", (c) => {
  return c.json(success(listCreatorProducts()), 200);
});
