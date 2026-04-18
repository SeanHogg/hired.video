import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Context } from "hono";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { callLLMJsonWithUsage, getApiKey, type LLMUsage } from "../services/ai.js";
import { attachTokenBudget, checkTokenBudget, requirePremium } from "../middleware/tierEnforcement.js";
import { recordTokenUsage } from "../services/billing.js";
import { resumeContentToText as resumeContentToTextShared } from "../services/resume-parse.js";

export const matchRoutes = new Hono<{ Variables: Variables }>();
matchRoutes.use("*", attachTokenBudget());

// =====================================================================
// Schemas
// =====================================================================

/** Shared input shape for analyze + tailor. Accepts EITHER raw HTML
 *  (from the content-script capture) OR a jobId (DB rehydration).
 *  `priorRecommendations` lets the tailor endpoint receive the gap
 *  analysis from a previous /analyze call so the LLM can target those
 *  specific weaknesses when rewriting the resume. */
const MatchInputSchema = z
  .object({
    jobHtml: z.string().optional(),
    jobId: z.string().uuid().optional(),
    resumeId: z.string().uuid().optional(),
    sourceUrl: z.string().optional(),
    priorRecommendations: z.string().optional(),
  })
  .refine((v) => !!(v.jobHtml || v.jobId), {
    message: "Either jobHtml or jobId is required",
  });

const MatchByIdSchema = z.object({
  jobId: z.string().uuid(),
  resumeId: z.string().uuid(),
});

const MatchByContentSchema = z.object({
  jobContent: z.string().min(1),
  resumeContent: z.string().min(1),
});

// ---- LLM response schemas ---

/** LLMs sometimes return recommendations as an array of strings instead
 *  of a single string. This transformer coerces both forms to a string. */
const coerceToString = z.union([
  z.string(),
  z.array(z.string()).transform((arr) => arr.map((s) => `- ${s}`).join("\n")),
]).pipe(z.string());

const AnalyzeResponseSchema = z.object({
  score: z.number().min(0).max(100),
  summaryRecommendations: coerceToString,
});

const TailorResponseSchema = z.object({
  oldScore: z.number().min(0).max(100),
  newScore: z.number().min(0).max(100),
  markdownResume: z.string(),
  summaryRecommendations: coerceToString,
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

// =====================================================================
// Shared helpers — Single Responsibility
// =====================================================================

/** Max chars of job/resume text sent to the LLM. 6000 chars ≈ 1500
 *  tokens — stays under even the smallest free model context window. */
const TEXT_CAP = 6000;

/** Strip HTML tags and collapse whitespace to plain text for LLM. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Resolve job text from raw HTML or a DB row by ID. Returns capped text. */
async function resolveJobText(input: { jobHtml?: string; jobId?: string }): Promise<string | null> {
  if (input.jobHtml && input.jobHtml.trim().length > 0) {
    return htmlToText(input.jobHtml).slice(0, TEXT_CAP);
  }
  if (!input.jobId) return null;

  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.jobItems)
    .where(eq(schema.jobItems.id, input.jobId))
    .limit(1);
  if (!row) return null;

  const parts: string[] = [];
  parts.push(`Title: ${row.title}`);
  if (row.company) parts.push(`Company: ${row.company}`);
  if (row.location) parts.push(`Location: ${row.location}`);
  if (row.jobType) parts.push(`Type: ${row.jobType}`);
  if (row.experienceLevel) parts.push(`Level: ${row.experienceLevel}`);
  if (row.salaryMin || row.salaryMax) {
    parts.push(`Salary: ${row.salaryMin ?? ""}-${row.salaryMax ?? ""} ${row.salaryCurrency ?? "USD"}`);
  }
  parts.push("\nDescription:\n" + (row.description ?? ""));

  const details = ((row as any).details ?? {}) as Record<string, unknown>;
  for (const [label, key] of [["Responsibilities", "responsibilities"], ["Requirements", "requirements"], ["Qualifications", "qualifications"], ["Benefits", "benefits"]]) {
    const val = details[key];
    if (Array.isArray(val) && val.length > 0) {
      parts.push(`\n${label}:\n- ` + val.map(String).join("\n- "));
    }
  }
  if (Array.isArray(row.skillsRequired) && row.skillsRequired.length > 0) {
    parts.push(`\nSkills: ${(row.skillsRequired as string[]).join(", ")}`);
  }

  return parts.join("\n").slice(0, TEXT_CAP);
}

// resumeContentToText is imported from ../services/resume-parse.js and
// wrapped to apply the local TEXT_CAP.
function resumeContentToText(content: unknown): string {
  return resumeContentToTextShared(content, TEXT_CAP);
}

/** Resolve resume for current user — prefers provided ID, falls back to active/master. */
async function resolveResume(userId: string, resumeId?: string) {
  const db = getDb();
  if (resumeId) {
    const [row] = await db
      .select()
      .from(schema.resumeInformation)
      .where(eq(schema.resumeInformation.id, resumeId))
      .limit(1);
    return row ?? null;
  }
  const all = await db
    .select()
    .from(schema.resumeInformation)
    .where(eq(schema.resumeInformation.userId, userId));
  return all.find((r) => r.isActive) ?? all.find((r) => r.isMaster) ?? all[0] ?? null;
}

/** Heuristic keyword-overlap scorer — used when API key is missing or all LLM models fail. */
function keywordScore(jobText: string, resumeText: string): { score: number; message: string } {
  const jobWords = new Set(jobText.toLowerCase().split(/\W+/).filter((w) => w.length > 4));
  const resumeWords = resumeText.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
  const matches = resumeWords.filter((w) => jobWords.has(w)).length;
  const score = Math.min(100, Math.round((matches / Math.max(jobWords.size, 1)) * 150));
  return {
    score,
    message:
      "AI analysis unavailable — using keyword overlap as a rough estimate.\n\n" +
      `Keyword overlap score: ${score}/100. Review the job description and ensure your resume highlights relevant skills and experience.`,
  };
}

/** Record AI usage for billing/audit using REAL token counts from the
 *  OpenRouter response. Fire-and-forget. */
function recordMatchUsage(userId: string, featureKey: string, usage: LLMUsage) {
  void recordTokenUsage({
    userId,
    model: usage.model,
    featureKey,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
  });
}

// =====================================================================
// Shared pipeline: auth → usage-check → parse → resolve → call LLM
// =====================================================================

interface PipelineContext {
  userId: string;
  jobText: string;
  resumeText: string;
  resumeId: string;
  sourceUrl?: string;
  apiKey?: string;
  priorRecommendations?: string;
}

/** Common auth + resolve logic for analyze/tailor/byid. Returns either
 *  a ready-to-use PipelineContext or an error Response. */
async function resolveMatchContext(c: Context<{ Variables: Variables }>): Promise<PipelineContext | Response> {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const limitError = await checkTokenBudget(c as any);
  if (limitError) return limitError;

  const body = await c.req.json().catch(() => null);
  const parsed = MatchInputSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);

  const { jobHtml, jobId, resumeId, sourceUrl, priorRecommendations } = parsed.data;
  const resume = await resolveResume(userId, resumeId);
  if (!resume) return c.json(error("NOT_FOUND", "No resume found. Please create a resume first."), 404);

  const jobText = await resolveJobText({ jobHtml, jobId });
  if (!jobText) return c.json(error("NOT_FOUND", "Job not found. Track the job before scoring."), 404);

  const resumeText = resumeContentToText(resume.content);
  const apiKey = getApiKey((c.env as any) ?? {});

  return { userId, jobText, resumeText, resumeId: resume.id, sourceUrl, apiKey, priorRecommendations };
}

function isResponse(val: PipelineContext | Response): val is Response {
  return val instanceof Response || (typeof val === "object" && "status" in val && typeof (val as any).json === "function");
}

// =====================================================================
// Routes
// =====================================================================

/** POST /api/match/analyze — score resume vs job */
matchRoutes.post("/analyze", async (c) => {
  const ctx = await resolveMatchContext(c);
  if (isResponse(ctx)) return ctx;

  if (ctx.apiKey) {
    try {
      const { data: result, usage } = await callLLMJsonWithUsage(
        ctx.apiKey,
        {
          systemPrompt: `You are a professional resume analyst. Evaluate how well a resume matches a job description and return a JSON response.
Scoring criteria:
- Skills match (required skills present in resume): 40%
- Experience relevance (titles, industries, years): 30%
- Education and certifications: 15%
- Language and keywords match: 15%
Always return valid JSON with integer score 0-100 and actionable recommendations.`,
          userMessage: `Job Description:\n${ctx.jobText}\n\n---\n\nResume:\n${ctx.resumeText}\n\n---\n\nReturn JSON: { "score": <0-100>, "summaryRecommendations": "<2-4 bullet points of key gaps and suggestions>" }`,
          responseFormat: "json_object",
          temperature: 0.3,
        },
        AnalyzeResponseSchema,
      );

      recordMatchUsage(ctx.userId, "match_analyze", usage);
      return c.json(success({ score: result.score, summaryRecommendations: result.summaryRecommendations, resumeId: ctx.resumeId, sourceUrl: ctx.sourceUrl }), 200);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[match/analyze] LLM failed:", errMsg);
      // Return the LLM error in the fallback message so it's debuggable
      const { score, message } = keywordScore(ctx.jobText, ctx.resumeText);
      return c.json(success({
        score,
        summaryRecommendations: message + `\n\n_LLM error: ${errMsg.slice(0, 300)}_`,
        resumeId: ctx.resumeId,
        sourceUrl: ctx.sourceUrl,
      }), 200);
    }
  }

  console.warn("[match/analyze] No API key. jobLen:", ctx.jobText.length, "resumeLen:", ctx.resumeText.length);
  const { score, message } = keywordScore(ctx.jobText, ctx.resumeText);
  return c.json(success({ score, summaryRecommendations: message, resumeId: ctx.resumeId, sourceUrl: ctx.sourceUrl }), 200);
});

/** POST /api/match/tailor — rewrite resume to better match a job */
matchRoutes.post("/tailor", async (c) => {
  const ctx = await resolveMatchContext(c);
  if (isResponse(ctx)) return ctx;

  if (ctx.apiKey) {
    try {
      // Build a targeted prompt — if prior score recommendations exist,
      // inject them so the LLM specifically addresses identified gaps
      // rather than doing a generic rewrite.
      const priorSection = ctx.priorRecommendations
        ? `\n\nPRIOR SCORE ANALYSIS (address these specific gaps):\n${ctx.priorRecommendations}\n`
        : "";

      const { data: result, usage } = await callLLMJsonWithUsage(
        ctx.apiKey,
        {
          systemPrompt: `You are an expert resume writer. Your job is to:
1. Score the original resume against the job (0-100)
2. Rewrite the resume in Markdown to better match the job requirements
3. Score the rewritten resume (should be higher)
4. Summarize the key changes made
${ctx.priorRecommendations ? "\nIMPORTANT: A prior analysis identified specific gaps and recommendations (included below the resume). You MUST directly address each of these gaps in your rewrite. Prioritize fixing the identified weaknesses over generic improvements." : ""}

Rules:
- Keep the same person's real experience — do not fabricate jobs or degrees
- Reorder and rephrase bullet points to highlight relevant skills
- Add missing keywords naturally where experience supports it
- Use a professional Markdown resume format with sections: Summary, Experience, Skills, Education
- Return valid JSON only`,
          userMessage: `Job Description:\n${ctx.jobText}\n\n---\n\nOriginal Resume:\n${ctx.resumeText}${priorSection}\n\n---\n\nReturn JSON: { "oldScore": <0-100>, "newScore": <0-100>, "markdownResume": "<full tailored resume in Markdown>", "summaryRecommendations": "<3-5 bullet points summarising changes>" }`,
          responseFormat: "json_object",
          temperature: 0.5,
        },
        TailorResponseSchema,
      );

      recordMatchUsage(ctx.userId, "match_tailor", usage);
      return c.json(success({ ...result, resumeId: ctx.resumeId, sourceUrl: ctx.sourceUrl }), 200);
    } catch (err) {
      console.error("[match/tailor] LLM failed:", err instanceof Error ? err.message : err);
    }
  }

  return c.json(
    success({
      oldScore: 0,
      newScore: 0,
      markdownResume: `# Resume\n\n${ctx.resumeText}`,
      summaryRecommendations: "AI tailoring unavailable — using keyword overlap as a rough estimate.",
      resumeId: ctx.resumeId,
      sourceUrl: ctx.sourceUrl,
    }),
    200,
  );
});

/** POST /api/match — redirect to analyze */
matchRoutes.post("/", (_c) => _c.redirect("/api/match/analyze", 307));

/** POST /api/match/byid — analyze by job ID + resume ID */
matchRoutes.post("/byid", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const limitError = await checkTokenBudget(c as any);
  if (limitError) return limitError;

  const body = await c.req.json().catch(() => null);
  const parsed = MatchByIdSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "jobId and resumeId are required"), 400);

  const { jobId, resumeId } = parsed.data;
  const jobText = await resolveJobText({ jobId });
  if (!jobText) return c.json(error("NOT_FOUND", "Job not found"), 404);

  const resume = await resolveResume(userId, resumeId);
  if (!resume) return c.json(error("NOT_FOUND", "Resume not found"), 404);

  const resumeText = resumeContentToText(resume.content);
  const apiKey = getApiKey((c.env as any) ?? {});

  if (apiKey) {
    try {
      const { data: result, usage } = await callLLMJsonWithUsage(
        apiKey,
        {
          systemPrompt: "You are a professional resume analyst. Evaluate how well a resume matches a job description and return valid JSON.",
          userMessage: `Job:\n${jobText}\n\n---\n\nResume:\n${resumeText}\n\n---\n\nReturn JSON: { "score": <0-100>, "summaryRecommendations": "<brief recommendations>" }`,
          responseFormat: "json_object",
          temperature: 0.3,
        },
        AnalyzeResponseSchema,
      );
      recordMatchUsage(userId, "match_byid", usage);
      return c.json(success({ ...result, jobId, resumeId }), 200);
    } catch (err) {
      console.error("[match/byid] LLM failed:", err instanceof Error ? err.message : err);
    }
  }

  const { score, message } = keywordScore(jobText, resumeText);
  return c.json(success({ score, summaryRecommendations: message, jobId, resumeId }), 200);
});

/** POST /api/match/bycontent — analyze by raw text */
matchRoutes.post("/bycontent", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const limitError = await checkTokenBudget(c as any);
  if (limitError) return limitError;

  const body = await c.req.json().catch(() => null);
  const parsed = MatchByContentSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "jobContent and resumeContent are required"), 400);

  const jobText = parsed.data.jobContent.slice(0, TEXT_CAP);
  const resumeText = parsed.data.resumeContent.slice(0, TEXT_CAP);
  const apiKey = getApiKey((c.env as any) ?? {});

  if (apiKey) {
    try {
      const { data: result, usage } = await callLLMJsonWithUsage(
        apiKey,
        {
          systemPrompt: "You are a professional resume analyst. Evaluate how well a resume matches a job description and return valid JSON.",
          userMessage: `Job:\n${jobText}\n\n---\n\nResume:\n${resumeText}\n\n---\n\nReturn JSON: { "score": <0-100>, "summaryRecommendations": "<brief recommendations>" }`,
          responseFormat: "json_object",
          temperature: 0.3,
        },
        AnalyzeResponseSchema,
      );
      recordMatchUsage(userId, "match_bycontent", usage);
      return c.json(success(result), 200);
    } catch (err) {
      console.error("[match/bycontent] LLM failed:", err instanceof Error ? err.message : err);
    }
  }

  const { score, message } = keywordScore(jobText, resumeText);
  return c.json(success({ score, summaryRecommendations: message }), 200);
});

/** POST /api/match/insights — deep career analysis (Premium only) */
matchRoutes.post("/insights", requirePremium("Career Insights"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const insightsSchema = z.object({ jobHtml: z.string().min(1), resumeId: z.string().uuid().optional() });
  const parsed = insightsSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);

  const resume = await resolveResume(userId, parsed.data.resumeId);
  if (!resume) return c.json(error("NOT_FOUND", "No resume found. Please create a resume first."), 404);

  const jobText = htmlToText(parsed.data.jobHtml).slice(0, TEXT_CAP);
  const resumeText = resumeContentToText(resume.content);
  const apiKey = getApiKey((c.env as any) ?? {});

  if (!apiKey) return c.json(error("AI_ERROR", "AI service not configured. Please contact support."), 503);

  try {
    const { data: result, usage } = await callLLMJsonWithUsage(
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
  "seniorityFit": "<1-2 sentences>",
  "missingSkills": [{"skill": "<name>", "category": "<technical|soft|domain|tool>", "importance": "critical|important|nice-to-have"}],
  "careerTrajectory": "<2-3 sentences>",
  "interviewTips": ["<tip 1>", "<tip 2>", "<tip 3>"],
  "suggestedCertifications": [{"name": "<cert>", "reason": "<why>"}],
  "estimatedRampTime": "<e.g. '2-4 weeks'>"
}`,
        responseFormat: "json_object",
        temperature: 0.4,
      },
      InsightsResponseSchema,
    );

    recordMatchUsage(userId, "match_insights", usage);
    return c.json(success({ ...result, resumeId: resume.id }), 200);
  } catch (err) {
    console.error("[match/insights] LLM failed:", err instanceof Error ? err.message : err);
    return c.json(error("AI_ERROR", "Failed to generate insights. Please try again."), 500);
  }
});

matchRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Match route not found" } }, 404),
);
