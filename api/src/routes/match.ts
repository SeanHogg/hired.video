import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { callLLMJson, getApiKey } from "../services/ai.js";
import { checkAIUsage, requirePremium } from "../middleware/tierEnforcement.js";

export const matchRoutes = new Hono<{ Variables: Variables }>();

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const AnalyzeSchema = z.object({
  jobHtml: z.string().min(1),
  resumeId: z.string().uuid().optional(),
  sourceUrl: z.string().optional(),
});

const TailorSchema = z.object({
  jobHtml: z.string().min(1),
  resumeId: z.string().uuid().optional(),
  sourceUrl: z.string().optional(),
});

const MatchByIdSchema = z.object({
  jobId: z.string().uuid(),
  resumeId: z.string().uuid(),
});

const MatchByContentSchema = z.object({
  jobContent: z.string().min(1),
  resumeContent: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip HTML tags and collapse whitespace to get plain text for LLM. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000); // cap to avoid token overflow
}

/** Convert a resume JSON content blob to readable plain text for LLM. */
function resumeContentToText(content: unknown): string {
  if (!content || typeof content !== "object") return "";

  const parts: string[] = [];
  const c = content as Record<string, unknown>;

  // Common resume JSON fields (flexible — handles various resume builder formats)
  if (c.name || c.fullName) parts.push(`Name: ${c.name ?? c.fullName}`);
  if (c.headline || c.title) parts.push(`Title: ${c.headline ?? c.title}`);
  if (c.summary || c.objective) parts.push(`Summary: ${c.summary ?? c.objective}`);

  const skills = c.skills ?? c.Skills;
  if (Array.isArray(skills)) {
    const skillList = skills.map((s: unknown) => (typeof s === "string" ? s : (s as any)?.name ?? "")).filter(Boolean);
    if (skillList.length) parts.push(`Skills: ${skillList.join(", ")}`);
  } else if (typeof skills === "string") {
    parts.push(`Skills: ${skills}`);
  }

  const experience = c.experience ?? c.workExperience ?? c.Experience ?? [];
  if (Array.isArray(experience)) {
    for (const job of experience) {
      if (!job || typeof job !== "object") continue;
      const j = job as Record<string, unknown>;
      parts.push(`\nJob: ${j.title ?? j.position ?? ""} at ${j.company ?? j.employer ?? ""}`);
      if (j.description) parts.push(String(j.description).slice(0, 500));
    }
  }

  const education = c.education ?? c.Education ?? [];
  if (Array.isArray(education)) {
    for (const edu of education) {
      if (!edu || typeof edu !== "object") continue;
      const e = edu as Record<string, unknown>;
      parts.push(`Education: ${e.degree ?? e.program ?? ""} at ${e.institution ?? e.school ?? ""}`);
    }
  }

  // If content is stored as serialised JSON string under a known key
  if (c.resumeSerialized && typeof c.resumeSerialized === "string") {
    try {
      return resumeContentToText(JSON.parse(c.resumeSerialized));
    } catch {
      parts.push(c.resumeSerialized.slice(0, 4000));
    }
  }

  // If content is just a markdown string
  if (c.markdown && typeof c.markdown === "string") {
    parts.push(c.markdown.slice(0, 4000));
  }

  return parts.join("\n") || JSON.stringify(content).slice(0, 4000);
}

/** Resolve resume for current user — prefers provided ID, falls back to active/master. */
async function resolveResume(userId: string, resumeId?: string) {
  const db = getDb();
  if (resumeId) {
    const [row] = await db
      .select()
      .from(schema.resumeInformation)
      .where(and(eq(schema.resumeInformation.id, resumeId), eq(schema.resumeInformation.userId, userId)))
      .limit(1);
    return row ?? null;
  }
  // Try active resume first, then master, then any
  const all = await db
    .select()
    .from(schema.resumeInformation)
    .where(eq(schema.resumeInformation.userId, userId));
  return (
    all.find((r) => r.isActive) ??
    all.find((r) => r.isMaster) ??
    all[0] ??
    null
  );
}

const AnalyzeResponseSchema = z.object({
  score: z.number().min(0).max(100),
  summaryRecommendations: z.string(),
});

const TailorResponseSchema = z.object({
  oldScore: z.number().min(0).max(100),
  newScore: z.number().min(0).max(100),
  markdownResume: z.string(),
  summaryRecommendations: z.string(),
});

// ---------------------------------------------------------------------------
// POST /api/match/analyze
// Scores how well the user's resume matches a job posting.
// ---------------------------------------------------------------------------
matchRoutes.post("/analyze", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const limitError = await checkAIUsage(c as any);
  if (limitError) return limitError;

  const body = await c.req.json().catch(() => null);
  const parsed = AnalyzeSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);

  const { jobHtml, resumeId, sourceUrl } = parsed.data;
  const resume = await resolveResume(userId, resumeId);
  if (!resume) return c.json(error("NOT_FOUND", "No resume found. Please create a resume first."), 404);

  const jobText = htmlToText(jobHtml);
  const resumeText = resumeContentToText(resume.content);

  const apiKey = getApiKey((c.env as any) ?? {});

  if (apiKey) {
    try {
      const result = await callLLMJson(
        apiKey,
        {
          systemPrompt: `You are a professional resume analyst. Evaluate how well a resume matches a job description and return a JSON response.
Scoring criteria:
- Skills match (required skills present in resume): 40%
- Experience relevance (titles, industries, years): 30%
- Education and certifications: 15%
- Language and keywords match: 15%
Always return valid JSON with integer score 0-100 and actionable recommendations.`,
          userMessage: `Job Description:\n${jobText}\n\n---\n\nResume:\n${resumeText}\n\n---\n\nReturn JSON: { "score": <0-100>, "summaryRecommendations": "<2-4 bullet points of key gaps and suggestions>" }`,
          responseFormat: "json_object",
          temperature: 0.3,
        },
        AnalyzeResponseSchema,
      );

      // Record AI usage
      const db = getDb();
      await db.insert(schema.aiUsageRecords).values({
        userId,
        model: "google/gemini-flash-1.5",
        featureKey: "match_analyze",
        promptTokens: Math.round((jobText.length + resumeText.length) / 4),
        completionTokens: Math.round(JSON.stringify(result).length / 4),
        totalTokens: Math.round((jobText.length + resumeText.length + JSON.stringify(result).length) / 4),
      });

      return c.json(success({ score: result.score, summaryRecommendations: result.summaryRecommendations, resumeId: resume.id, sourceUrl }), 200);
    } catch {
      // Fall through to heuristic fallback
    }
  }

  // Heuristic fallback (no API key or LLM error)
  const jobWords = new Set(jobText.toLowerCase().split(/\W+/).filter((w) => w.length > 4));
  const resumeWords = resumeText.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
  const matches = resumeWords.filter((w) => jobWords.has(w)).length;
  const score = Math.min(100, Math.round((matches / Math.max(jobWords.size, 1)) * 150));

  return c.json(
    success({
      score,
      summaryRecommendations:
        "AI analysis unavailable. Configure OPENROUTER_API_KEY for detailed recommendations.\n\n" +
        `Keyword overlap score: ${score}/100. Review the job description and ensure your resume highlights relevant skills and experience.`,
      resumeId: resume.id,
      sourceUrl,
    }),
    200,
  );
});

// ---------------------------------------------------------------------------
// POST /api/match/tailor
// Rewrites the resume to better match a job posting.
// ---------------------------------------------------------------------------
matchRoutes.post("/tailor", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const limitError = await checkAIUsage(c as any);
  if (limitError) return limitError;

  const body = await c.req.json().catch(() => null);
  const parsed = TailorSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);

  const { jobHtml, resumeId, sourceUrl } = parsed.data;
  const resume = await resolveResume(userId, resumeId);
  if (!resume) return c.json(error("NOT_FOUND", "No resume found. Please create a resume first."), 404);

  const jobText = htmlToText(jobHtml);
  const resumeText = resumeContentToText(resume.content);

  const apiKey = getApiKey((c.env as any) ?? {});

  if (apiKey) {
    try {
      const result = await callLLMJson(
        apiKey,
        {
          systemPrompt: `You are an expert resume writer. Your job is to:
1. Score the original resume against the job (0-100)
2. Rewrite the resume in Markdown to better match the job requirements
3. Score the rewritten resume (should be higher)
4. Summarize the key changes made

Rules:
- Keep the same person's real experience — do not fabricate jobs or degrees
- Reorder and rephrase bullet points to highlight relevant skills
- Add missing keywords naturally where experience supports it
- Use a professional Markdown resume format with sections: Summary, Experience, Skills, Education
- Return valid JSON only`,
          userMessage: `Job Description:\n${jobText}\n\n---\n\nOriginal Resume:\n${resumeText}\n\n---\n\nReturn JSON: { "oldScore": <0-100>, "newScore": <0-100>, "markdownResume": "<full tailored resume in Markdown>", "summaryRecommendations": "<3-5 bullet points summarising changes>" }`,
          responseFormat: "json_object",
          temperature: 0.5,
        },
        TailorResponseSchema,
      );

      const totalTokens = Math.round((jobText.length + resumeText.length + result.markdownResume.length) / 4);
      const db = getDb();
      await db.insert(schema.aiUsageRecords).values({
        userId,
        model: "google/gemini-flash-1.5",
        featureKey: "match_tailor",
        promptTokens: Math.round((jobText.length + resumeText.length) / 4),
        completionTokens: Math.round(result.markdownResume.length / 4),
        totalTokens,
      });

      return c.json(
        success({ ...result, resumeId: resume.id, sourceUrl }),
        200,
      );
    } catch {
      // Fall through to stub
    }
  }

  return c.json(
    success({
      oldScore: 0,
      newScore: 0,
      markdownResume: `# ${resume.title}\n\n${resumeText}`,
      summaryRecommendations: "AI tailoring unavailable. Configure OPENROUTER_API_KEY for AI-powered resume tailoring.",
      resumeId: resume.id,
      sourceUrl,
    }),
    200,
  );
});

// ---------------------------------------------------------------------------
// POST /api/match — simple match by job HTML + auto-resolved resume
// ---------------------------------------------------------------------------
matchRoutes.post("/", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => ({}));
  // Forward to analyze logic
  const fakeReq = new Request(c.req.url, { method: "POST", body: JSON.stringify({ jobHtml: body.jobHtml ?? body.html ?? "", resumeId: body.resumeId }) });
  return c.redirect("/api/match/analyze", 307);
});

// ---------------------------------------------------------------------------
// POST /api/match/byid
// ---------------------------------------------------------------------------
matchRoutes.post("/byid", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const limitError = await checkAIUsage(c as any);
  if (limitError) return limitError;

  const body = await c.req.json().catch(() => null);
  const parsed = MatchByIdSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "jobId and resumeId are required"), 400);

  const { jobId, resumeId } = parsed.data;
  const db = getDb();

  const [job] = await db
    .select({ title: schema.jobItems.title, description: schema.jobItems.description, company: schema.jobItems.company })
    .from(schema.jobItems)
    .where(eq(schema.jobItems.id, jobId))
    .limit(1);

  if (!job) return c.json(error("NOT_FOUND", "Job not found"), 404);

  const jobHtml = `<h1>${job.title}</h1><p>${job.company ?? ""}</p><div>${job.description}</div>`;
  const fakeBody = { jobHtml, resumeId };

  // Reuse analyze logic inline
  const resume = await resolveResume(userId, resumeId);
  if (!resume) return c.json(error("NOT_FOUND", "Resume not found"), 404);

  const jobText = htmlToText(jobHtml);
  const resumeText = resumeContentToText(resume.content);
  const apiKey = getApiKey((c.env as any) ?? {});

  if (apiKey) {
    try {
      const result = await callLLMJson(
        apiKey,
        {
          systemPrompt: "You are a professional resume analyst. Evaluate how well a resume matches a job description and return valid JSON.",
          userMessage: `Job Description:\n${jobText}\n\n---\n\nResume:\n${resumeText}\n\n---\n\nReturn JSON: { "score": <0-100>, "summaryRecommendations": "<brief recommendations>" }`,
          responseFormat: "json_object",
          temperature: 0.3,
        },
        AnalyzeResponseSchema,
      );
      return c.json(success({ ...result, jobId, resumeId }), 200);
    } catch {
      // fall through
    }
  }

  const jobWords = new Set(jobText.toLowerCase().split(/\W+/).filter((w) => w.length > 4));
  const resumeWords = resumeText.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
  const score = Math.min(100, Math.round((resumeWords.filter((w) => jobWords.has(w)).length / Math.max(jobWords.size, 1)) * 150));
  return c.json(success({ score, summaryRecommendations: `Keyword match score: ${score}/100`, jobId, resumeId }), 200);
});

// ---------------------------------------------------------------------------
// POST /api/match/bycontent
// ---------------------------------------------------------------------------
matchRoutes.post("/bycontent", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const limitError = await checkAIUsage(c as any);
  if (limitError) return limitError;

  const body = await c.req.json().catch(() => null);
  const parsed = MatchByContentSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "jobContent and resumeContent are required"), 400);

  const { jobContent, resumeContent } = parsed.data;
  const apiKey = getApiKey((c.env as any) ?? {});

  if (apiKey) {
    try {
      const result = await callLLMJson(
        apiKey,
        {
          systemPrompt: "You are a professional resume analyst. Evaluate how well a resume matches a job description and return valid JSON.",
          userMessage: `Job:\n${jobContent.slice(0, 4000)}\n\n---\n\nResume:\n${resumeContent.slice(0, 4000)}\n\n---\n\nReturn JSON: { "score": <0-100>, "summaryRecommendations": "<brief recommendations>" }`,
          responseFormat: "json_object",
          temperature: 0.3,
        },
        AnalyzeResponseSchema,
      );
      return c.json(success(result), 200);
    } catch {
      // fall through
    }
  }

  const jobWords = new Set(jobContent.toLowerCase().split(/\W+/).filter((w) => w.length > 4));
  const resumeWords = resumeContent.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
  const score = Math.min(100, Math.round((resumeWords.filter((w) => jobWords.has(w)).length / Math.max(jobWords.size, 1)) * 150));
  return c.json(success({ score, summaryRecommendations: `Keyword match score: ${score}/100` }), 200);
});

// ---------------------------------------------------------------------------
// POST /api/match/insights — deep career insights (Premium only)
//
// Goes beyond a pass/fail score to provide:
//  - Skill gap breakdown (missing skills by category)
//  - Career trajectory analysis (seniority fit, growth path)
//  - Interview preparation tips specific to the role
//  - Suggested learning resources / certifications
// Free users get a 402 upgrade prompt; Premium users get full analysis.
// ---------------------------------------------------------------------------

const InsightsSchema = z.object({
  jobHtml: z.string().min(1),
  resumeId: z.string().uuid().optional(),
});

const InsightsResponseSchema = z.object({
  overallFit: z.enum(["strong", "good", "fair", "weak"]),
  seniorityFit: z.string(),
  missingSkills: z.array(z.object({ skill: z.string(), category: z.string(), importance: z.enum(["critical", "important", "nice-to-have"]) })),
  careerTrajectory: z.string(),
  interviewTips: z.array(z.string()),
  suggestedCertifications: z.array(z.object({ name: z.string(), reason: z.string() })),
  estimatedRampTime: z.string(),
});

matchRoutes.post("/insights", requirePremium("Career Insights"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = InsightsSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);

  const resume = await resolveResume(userId, parsed.data.resumeId);
  if (!resume) return c.json(error("NOT_FOUND", "No resume found. Please create a resume first."), 404);

  const jobText = htmlToText(parsed.data.jobHtml);
  const resumeText = resumeContentToText(resume.content);
  const apiKey = getApiKey((c.env as any) ?? {});

  if (apiKey) {
    try {
      const result = await callLLMJson(
        apiKey,
        {
          systemPrompt: `You are a senior career strategist and talent acquisition expert. Perform a deep analysis of a candidate's fit for a role, going beyond keyword matching to assess career trajectory, skill gaps, and actionable preparation steps. Return valid JSON only.`,
          userMessage: `Analyse this candidate's fit for the role and return a comprehensive JSON insights report.

Job Description:
${jobText}

---

Candidate Resume:
${resumeText}

---

Return JSON matching this structure exactly:
{
  "overallFit": "strong|good|fair|weak",
  "seniorityFit": "<1-2 sentences on whether the candidate is under/over/well-qualified>",
  "missingSkills": [{"skill": "<skill name>", "category": "<technical|soft|domain|tool>", "importance": "critical|important|nice-to-have"}],
  "careerTrajectory": "<2-3 sentences on how this role fits the candidate's career arc>",
  "interviewTips": ["<specific tip 1>", "<specific tip 2>", "<specific tip 3>"],
  "suggestedCertifications": [{"name": "<cert/course name>", "reason": "<why it would help>"}],
  "estimatedRampTime": "<e.g. '2-4 weeks' to be fully productive in this role>"
}`,
          responseFormat: "json_object",
          temperature: 0.4,
        },
        InsightsResponseSchema,
      );

      const db = getDb();
      await db.insert(schema.aiUsageRecords).values({
        userId,
        model: "google/gemini-flash-1.5",
        featureKey: "match_insights",
        promptTokens: Math.round((jobText.length + resumeText.length) / 4),
        completionTokens: Math.round(JSON.stringify(result).length / 4),
        totalTokens: Math.round((jobText.length + resumeText.length + JSON.stringify(result).length) / 4),
      });

      return c.json(success({ ...result, resumeId: resume.id }), 200);
    } catch {
      return c.json(error("AI_ERROR", "Failed to generate insights. Please try again."), 500);
    }
  }

  return c.json(error("AI_ERROR", "AI service not configured. Please contact support."), 503);
});

matchRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Match route not found" } }, 404),
);
