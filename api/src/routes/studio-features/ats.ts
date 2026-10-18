/**
 * Studio features — ATS-compatible output package. Mounted at /api/studio through the
 * routes/studio-features.ts barrel (split out of that file; paths unchanged).
 */
import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import { publicAtsPath } from "../../../../shared/public-paths.js";
import { slugify } from "../../../../shared/slugify.js";
import { tryExtractJson } from "../../../../shared/extract-json.js";
import type { AppEnv } from "../../types/index.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../../services/adapters/llm-client.js";
import { saveAtsPackage, viewAtsPackage } from "../../services/studio/ats-packages.js";
import { success, error } from "../../types/index.js";
import { validateJson } from "../helpers/validate.js";

export const atsRoutes = new Hono<AppEnv>();

// ═══════════════════════════════════════════════════════════════════════════════
// ██  6. ATS-COMPATIBLE OUTPUT PACKAGE
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/studio/ats/generate — generate an ATS-compatible package
atsRoutes.post("/ats/generate", validateJson(z.object({
    projectId: UuidLikeSchema,
    candidateName: z.string().min(1).max(200),
    headline: z.string().max(200).optional(),
    linkedinUrl: z.string().optional(),
    videoUrl: z.string().optional(),
    thumbnailUrl: z.string().optional(),
    scriptText: z.string().min(10),  // full script text to generate summary
  }), () => error("VALIDATION_ERROR", "Invalid request"), { emptyBody: null }), async (c) => {
  const user = c.var.user;
  const body = c.req.valid("json");


  // Generate ATS-parseable text summary using AI
  let textSummary = body.scriptText.slice(0, 1000);
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
        userMessage: `Candidate name: ${body.candidateName}
Headline: ${body.headline ?? "Professional"}
Video script:
${body.scriptText.slice(0, 3000)}`,
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
  const slug = `${slugify(body.candidateName, { fallback: "candidate", maxLen: 40 })}-${Date.now().toString(36)}`;

  const atsPackage = await saveAtsPackage({
    userId: user.sub,
    projectId: body.projectId,
    slug,
    videoUrl: body.videoUrl ?? null,
    thumbnailUrl: body.thumbnailUrl ?? null,
    candidateName: body.candidateName,
    headline: body.headline ?? null,
    textSummary,
    emailTemplate,
    linkedinUrl: body.linkedinUrl ?? null,
  });

  const pageUrl = `https://hired.video${publicAtsPath(slug)}`;

  return c.json(success({
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
  // Counts this view; the returned viewCount already includes it.
  const pkg = await viewAtsPackage(slug);

  return c.json(success({
    candidateName: pkg.candidateName,
    headline: pkg.headline,
    videoUrl: pkg.videoUrl,
    thumbnailUrl: pkg.thumbnailUrl,
    textSummary: pkg.textSummary,
    linkedinUrl: pkg.linkedinUrl,
    viewCount: pkg.viewCount,
    // Project id powers the engagement tracker on the public landing page.
    // Slug is for routing; events still need to land on the analytics
    // aggregation unit (project), not the slug.
    projectId: pkg.projectId,
  }));
});
