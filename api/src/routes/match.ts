/**
 * Thin HTTP route layer for /api/match.
 *
 * All business logic lives in routes/match-handlers.ts. This file only:
 *   1. Builds MatchDeps from the Hono request env (db, clock, LLM).
 *   2. Parses the JSON body.
 *   3. Delegates to the matching handler and returns its HandlerResult.
 *
 * /byid + /insights haven't been migrated to the handler layer yet —
 * they stay inline here until they get the same treatment.
 */

import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Context } from "hono";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { callLLMJsonWithUsage, getApiKey, type LLMUsage } from "../services/ai.js";
import {
  attachTokenBudget,
  checkTokenBudget,
  requirePremium,
} from "../middleware/tierEnforcement.js";
import { recordTokenUsage } from "../services/billing.js";
import { resumeContentToText as resumeContentToTextShared } from "../services/resume-parse.js";
import { createOpenRouterClient } from "../services/llm-client.js";
import {
  handleAnalyze,
  handleTailor,
  handleByContent,
  type MatchDeps,
  AnalyzeResponseSchema,
} from "./match-handlers.js";

export const matchRoutes = new Hono<{ Variables: Variables }>();
matchRoutes.use("*", attachTokenBudget());

// ---------------------------------------------------------------------------
// Build MatchDeps from the request context. Pulling this into a helper
// keeps route handlers identical across /analyze, /tailor, /bycontent.
// ---------------------------------------------------------------------------

function buildMatchDeps(c: Context<{ Variables: Variables }>): MatchDeps {
  const apiKey = getApiKey((c.env as any) ?? {});
  return {
    db: getDb(),
    now: () => new Date(),
    llm: apiKey ? createOpenRouterClient(apiKey) : null,
    recordUsage: ({ userId, usage }) => {
      void recordTokenUsage({
        userId,
        model: usage.model,
        featureKey: usage.model, // kept consistent with previous billing behaviour
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
      });
    },
  };
}

async function relay(c: Context<{ Variables: Variables }>, handlerResult: Promise<{ status: number; body: unknown }>) {
  const limitError = await checkTokenBudget(c as any);
  if (limitError) return limitError;
  const { status, body } = await handlerResult;
  return c.json(body as any, status as any);
}

/** POST /api/match/analyze — score resume vs job */
matchRoutes.post("/analyze", async (c) => {
  const body = await c.req.json().catch(() => null);
  const deps = buildMatchDeps(c);
  return relay(c, handleAnalyze(deps, c.var.user?.sub ?? null, body));
});

/** POST /api/match/tailor — rewrite resume to match job */
matchRoutes.post("/tailor", async (c) => {
  const body = await c.req.json().catch(() => null);
  const deps = buildMatchDeps(c);
  return relay(c, handleTailor(deps, c.var.user?.sub ?? null, body));
});

/** POST /api/match/bycontent — raw-string analyze */
matchRoutes.post("/bycontent", async (c) => {
  const body = await c.req.json().catch(() => null);
  const deps = buildMatchDeps(c);
  return relay(c, handleByContent(deps, c.var.user?.sub ?? null, body));
});

/** POST /api/match — redirect to analyze */
matchRoutes.post("/", (_c) => _c.redirect("/api/match/analyze", 307));

// ---------------------------------------------------------------------------
// /byid + /insights — not yet migrated to the handler layer. Kept inline
// with their original behaviour; safe to move later because they have
// their own tests (TODO).
// ---------------------------------------------------------------------------

const MatchByIdSchema = z.object({
  jobId: z.string().uuid(),
  resumeId: z.string().uuid(),
});

const TEXT_CAP = 6000;
function resumeContentToText(content: unknown): string {
  return resumeContentToTextShared(content, TEXT_CAP);
}

function recordMatchUsage(userId: string, _featureKey: string, usage: LLMUsage) {
  void recordTokenUsage({
    userId,
    model: usage.model,
    featureKey: usage.model,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
  });
}

const InsightsResponseSchema = z.object({
  overallFit: z.enum(["strong", "good", "fair", "weak"]),
  seniorityFit: z.string(),
  missingSkills: z.array(
    z.object({
      skill: z.string(),
      category: z.string(),
      importance: z.enum(["critical", "important", "nice-to-have"]),
    }),
  ),
  careerTrajectory: z.string(),
  interviewTips: z.array(z.string()),
  suggestedCertifications: z.array(z.object({ name: z.string(), reason: z.string() })),
  estimatedRampTime: z.string(),
});

/** Simple keyword-overlap fallback — duplicated from match-handlers only
 *  because /byid is still inline here. Delete when /byid migrates. */
function keywordScore(jobText: string, resumeText: string): { score: number; message: string } {
  const jobWords = new Set(jobText.toLowerCase().split(/\W+/).filter((w) => w.length > 4));
  const resumeWords = resumeText.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
  const matches = resumeWords.filter((w) => jobWords.has(w)).length;
  const score = Math.min(100, Math.round((matches / Math.max(jobWords.size, 1)) * 150));
  return {
    score,
    message:
      "AI analysis unavailable — using keyword overlap as a rough estimate.\n\n" +
      `Keyword overlap score: ${score}/100.`,
  };
}

async function resolveJobById(jobId: string): Promise<{ text: string; sourceUrl?: string; jobId?: string } | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.jobItems)
    .where(eq(schema.jobItems.id, jobId))
    .limit(1);
  if (!row) return null;

  const parts: string[] = [];
  parts.push(`Title: ${row.title}`);
  if (row.company) parts.push(`Company: ${row.company}`);
  if (row.location) parts.push(`Location: ${row.location}`);
  if (row.jobType) parts.push(`Type: ${row.jobType}`);
  parts.push("\nDescription:\n" + (row.description ?? ""));
  return {
    text: parts.join("\n").slice(0, TEXT_CAP),
    sourceUrl: row.sourceUrl ?? undefined,
    jobId: row.id,
  };
}

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

async function saveMatchScore(args: {
  userId: string;
  jobId?: string;
  resumeId: string;
  score: number;
  recommendations: string;
}): Promise<void> {
  if (!args.jobId) return;
  const db = getDb();
  await (db.insert(schema.resumeMatchScores) as any)
    .values({
      userId: args.userId,
      jobId: args.jobId,
      resumeId: args.resumeId,
      score: args.score,
      recommendations: args.recommendations,
    })
    .onConflictDoUpdate({
      target: [
        schema.resumeMatchScores.userId,
        schema.resumeMatchScores.jobId,
        schema.resumeMatchScores.resumeId,
      ],
      set: {
        score: args.score,
        recommendations: args.recommendations,
        updatedAt: sql`now()`,
      },
    });
}

void and; // retained for future use

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
  const job = await resolveJobById(jobId);
  if (!job) return c.json(error("NOT_FOUND", "Job not found"), 404);

  const resume = await resolveResume(userId, resumeId);
  if (!resume) return c.json(error("NOT_FOUND", "Resume not found"), 404);

  const resumeText = resumeContentToText(resume.content);
  const apiKey = getApiKey((c.env as any) ?? {});

  if (apiKey) {
    try {
      const { data: result, usage } = await callLLMJsonWithUsage(
        apiKey,
        {
          systemPrompt:
            "You are a professional resume analyst. Evaluate how well a resume matches a job description and return valid JSON.",
          userMessage: `Job:\n${job.text}\n\n---\n\nResume:\n${resumeText}\n\n---\n\nReturn JSON: { "score": <0-100>, "summaryRecommendations": "<brief recommendations>" }`,
          responseFormat: "json_object",
          temperature: 0.3,
        },
        AnalyzeResponseSchema,
      );
      recordMatchUsage(userId, "match_byid", usage);
      void saveMatchScore({
        userId,
        jobId: job.jobId,
        resumeId: resume.id,
        score: result.score,
        recommendations: result.summaryRecommendations,
      });
      return c.json(success({ ...result, jobId, resumeId }), 200);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[match/byid] LLM failed:", err instanceof Error ? err.message : err);
    }
  }

  const { score, message } = keywordScore(job.text, resumeText);
  return c.json(success({ score, summaryRecommendations: message, jobId, resumeId }), 200);
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

  const jobText = parsed.data.jobHtml
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TEXT_CAP);
  const resumeText = resumeContentToText(resume.content);
  const apiKey = getApiKey((c.env as any) ?? {});

  if (!apiKey) return c.json(error("AI_ERROR", "AI service not configured. Please contact support."), 503);

  try {
    const { data: result, usage } = await callLLMJsonWithUsage(
      apiKey,
      {
        systemPrompt:
          "You are a senior career strategist and talent acquisition expert. Perform a deep analysis of a candidate's fit for a role, going beyond keyword matching to assess career trajectory, skill gaps, and actionable preparation steps. Return valid JSON only.",
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
    // eslint-disable-next-line no-console
    console.error("[match/insights] LLM failed:", err instanceof Error ? err.message : err);
    return c.json(error("AI_ERROR", "Failed to generate insights. Please try again."), 500);
  }
});

matchRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Match route not found" } }, 404),
);
