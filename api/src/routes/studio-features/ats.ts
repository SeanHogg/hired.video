/**
 * Studio features — ATS-compatible output package. Mounted at /api/studio through the
 * routes/studio-features.ts barrel (split out of that file; paths unchanged).
 */
import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import { publicAtsPath } from "../../../../shared/public-paths.js";
import { slugify } from "../../../../shared/slugify.js";
import { tryExtractJson } from "../../../../shared/extract-json.js";
import type { AppEnv } from "../../types/index.js";
import { getDb } from "../../db/index.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../../services/adapters/llm-client.js";
import { ok, fail, studioAtsPackages } from "./shared.js";

export const atsRoutes = new Hono<AppEnv>();

// ═══════════════════════════════════════════════════════════════════════════════
// ██  6. ATS-COMPATIBLE OUTPUT PACKAGE
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/studio/ats/generate — generate an ATS-compatible package
atsRoutes.post("/ats/generate", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    projectId: UuidLikeSchema,
    candidateName: z.string().min(1).max(200),
    headline: z.string().max(200).optional(),
    linkedinUrl: z.string().optional(),
    videoUrl: z.string().optional(),
    thumbnailUrl: z.string().optional(),
    scriptText: z.string().min(10),  // full script text to generate summary
  }).safeParse(body);

  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request"), 400);

  // Generate ATS-parseable text summary using AI
  let textSummary = parsed.data.scriptText.slice(0, 1000);
  let emailTemplate = "";
  if (hasAnyLLMProviderKey(c.env)) {
    try {
      const llm = createLLMClient(c.env, c.var.user);
      const { content } = await llm.callText("studio_ats_package", {
        useCase: "studio_misc",
        systemPrompt: `You are a career advisor. Generate two things as a JSON object:
1. "summary" — a 2-3 paragraph professional text summary (suitable for ATS parsing) based on the video script
2. "email" — a brief professional email template a candidate can use to send this video resume to a recruiter

Return ONLY valid JSON: {"summary": "...", "email": "..."}`,
        userMessage: `Candidate name: ${parsed.data.candidateName}
Headline: ${parsed.data.headline ?? "Professional"}
Video script:
${parsed.data.scriptText.slice(0, 3000)}`,
      });
      const result = tryExtractJson<{ summary?: string; email?: string }>(content);
      if (result) {
        textSummary = result.summary ?? textSummary;
        emailTemplate = result.email ?? "";
      }
    } catch {
      // Use raw script as fallback
    }
  }

  // Generate unique slug
  const slug = `${slugify(parsed.data.candidateName, { fallback: "candidate", maxLen: 40 })}-${Date.now().toString(36)}`;

  const db = getDb();
  const [atsPackage] = await db.insert(studioAtsPackages).values({
    userId: user.sub,
    projectId: parsed.data.projectId,
    slug,
    videoUrl: parsed.data.videoUrl ?? null,
    thumbnailUrl: parsed.data.thumbnailUrl ?? null,
    candidateName: parsed.data.candidateName,
    headline: parsed.data.headline ?? null,
    textSummary,
    emailTemplate,
    linkedinUrl: parsed.data.linkedinUrl ?? null,
  } as any).returning();

  const pageUrl = `https://hired.video${publicAtsPath(slug)}`;

  return c.json(ok({
    id: atsPackage.id,
    slug,
    pageUrl,
    textSummary,
    emailTemplate,
  }), 201);
});

// GET /api/studio/ats/:slug — public landing page data (no auth)
atsRoutes.get("/ats/:slug", async (c) => {
  const slug = c.req.param("slug");
  const db = getDb();

  const [pkg] = await db.select().from(studioAtsPackages)
    .where(and(eq(studioAtsPackages.slug, slug), eq(studioAtsPackages.isActive, true)))
    .limit(1);

  if (!pkg) return c.json(fail("NOT_FOUND", "Package not found"), 404);

  // Increment view count
  await db.update(studioAtsPackages)
    .set({ viewCount: sql`${studioAtsPackages.viewCount} + 1` } as any)
    .where(eq(studioAtsPackages.id, pkg.id));

  return c.json(ok({
    candidateName: pkg.candidateName,
    headline: pkg.headline,
    videoUrl: pkg.videoUrl,
    thumbnailUrl: pkg.thumbnailUrl,
    textSummary: pkg.textSummary,
    linkedinUrl: pkg.linkedinUrl,
    viewCount: (pkg.viewCount ?? 0) + 1,
    // Project id powers the engagement tracker on the public landing page.
    // Slug is for routing; events still need to land on the analytics
    // aggregation unit (project), not the slug.
    projectId: pkg.projectId,
  }));
});
