/**
 * Pure match-domain handlers — the Job↔Resume scoring + tailoring flows.
 *
 * Extracted from routes/match.ts so that:
 *   • every side-effecting dependency (DB, clock, LLM) flows in via
 *     the `MatchDeps` port and can be faked in tests;
 *   • the business logic is testable with node:test (no Hono, no
 *     network), which lets us cover edge cases — empty resume, empty
 *     job, malformed LLM response, cache hit, multiple resumes — that
 *     the old route-only layout forced us to skip;
 *   • the route layer shrinks to a thin adapter that parses the request,
 *     resolves env, and forwards to the handler.
 *
 * Covers:
 *   • handleAnalyze   — POST /api/match/analyze
 *   • handleTailor    — POST /api/match/tailor
 *   • handleByContent — POST /api/match/bycontent (raw strings)
 *
 * /byid + /insights will move in a follow-up; the LLM plumbing is the
 * same so adding them is mechanical.
 */

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { schema } from "../db/index.js";
import { ok, fail, requireAuth, type HandlerResult } from "../handlers/shared.js";
import type { LLMClient } from "../services/llm-client.js";
import type { LLMUsage } from "../services/ai.js";
import { resumeContentToText as resumeContentToTextShared } from "../services/resume-parse.js";

export type DbPort = any;

export interface MatchDeps {
  db: DbPort;
  now: () => Date;
  /** LLM port — inject the OpenRouter client in prod, a fake in tests. */
  llm: LLMClient | null;
  /**
   * Fire-and-forget usage recorder. Real prod passes `recordTokenUsage`;
   * tests pass a spy so they can assert billing is correct.
   */
  recordUsage?: (args: {
    userId: string;
    featureKey: string;
    usage: LLMUsage;
  }) => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const MatchInputSchema = z
  .object({
    jobHtml: z.string().optional(),
    jobId: z.string().uuid().optional(),
    resumeId: z.string().uuid().optional(),
  })
  .refine((v) => !!(v.jobHtml || v.jobId), {
    message: "Either jobHtml or jobId is required",
  });

export const MatchByContentSchema = z.object({
  jobContent: z.string().min(1),
  resumeContent: z.string().min(1),
});

/** LLMs sometimes return recommendations as string[] instead of string. */
const coerceToString = z
  .union([
    z.string(),
    z.array(z.string()).transform((arr) => arr.map((s) => `- ${s}`).join("\n")),
  ])
  .pipe(z.string());

export const AnalyzeResponseSchema = z.object({
  score: z.number().min(0).max(100),
  summaryRecommendations: coerceToString,
});

export const TailorResponseSchema = z.object({
  oldScore: z.number().min(0).max(100),
  newScore: z.number().min(0).max(100),
  markdownResume: z.string(),
  summaryRecommendations: coerceToString,
});

// ---------------------------------------------------------------------------
// Pure helpers — exported for unit tests
// ---------------------------------------------------------------------------

export const TEXT_CAP = 6000;

/**
 * Strip HTML tags and collapse whitespace. Used when the caller supplies
 * raw page HTML instead of a persisted job record.
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Shape a persisted job row into the LLM text input. Centralized so
 * /analyze and /tailor can't drift.
 */
export function jobRowToLLMText(row: Record<string, unknown>): string {
  const parts: string[] = [];
  parts.push(`Title: ${row.title ?? ""}`);
  if (row.company) parts.push(`Company: ${row.company}`);
  if (row.location) parts.push(`Location: ${row.location}`);
  if (row.jobType) parts.push(`Type: ${row.jobType}`);
  if (row.experienceLevel) parts.push(`Level: ${row.experienceLevel}`);
  if (row.salaryMin || row.salaryMax) {
    parts.push(`Salary: ${row.salaryMin ?? ""}-${row.salaryMax ?? ""} ${row.salaryCurrency ?? "USD"}`);
  }
  parts.push("\nDescription:\n" + (row.description ?? ""));

  const details = (row.details ?? {}) as Record<string, unknown>;
  for (const [label, key] of [
    ["Responsibilities", "responsibilities"],
    ["Requirements", "requirements"],
    ["Qualifications", "qualifications"],
    ["Benefits", "benefits"],
  ] as const) {
    const val = details[key];
    if (Array.isArray(val) && val.length > 0) {
      parts.push(`\n${label}:\n- ` + val.map(String).join("\n- "));
    }
  }
  const skills = row.skillsRequired;
  if (Array.isArray(skills) && skills.length > 0) {
    parts.push(`\nSkills: ${(skills as string[]).join(", ")}`);
  }
  return parts.join("\n").slice(0, TEXT_CAP);
}

/** Wrap the shared resume parser so TEXT_CAP applies consistently. */
export function resumeContentToText(content: unknown): string {
  return resumeContentToTextShared(content, TEXT_CAP);
}

/**
 * Heuristic keyword-overlap scorer — used when the LLM is unavailable
 * (no API key, every fallback model failed, etc). Deterministic.
 */
export function keywordScore(jobText: string, resumeText: string): { score: number; message: string } {
  const jobWords = new Set(
    jobText
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 4),
  );
  const resumeWords = resumeText
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 4);
  const matches = resumeWords.filter((w) => jobWords.has(w)).length;
  const score = Math.min(100, Math.round((matches / Math.max(jobWords.size, 1)) * 150));
  return {
    score,
    message:
      "AI analysis unavailable — using keyword overlap as a rough estimate.\n\n" +
      `Keyword overlap score: ${score}/100. Review the job description and ensure your resume highlights relevant skills and experience.`,
  };
}

// ---------------------------------------------------------------------------
// Resolve helpers — DB access gated behind deps.db
// ---------------------------------------------------------------------------

interface ResolvedJob {
  text: string;
  sourceUrl?: string;
  jobId?: string;
}

export async function resolveJob(
  deps: MatchDeps,
  input: { jobHtml?: string; jobId?: string },
): Promise<ResolvedJob | null> {
  if (input.jobHtml && input.jobHtml.trim().length > 0) {
    return { text: htmlToPlainText(input.jobHtml).slice(0, TEXT_CAP) };
  }
  if (!input.jobId) return null;

  const [row] = await deps.db
    .select()
    .from(schema.jobItems)
    .where(eq(schema.jobItems.id, input.jobId))
    .limit(1);
  if (!row) return null;

  return {
    text: jobRowToLLMText(row as Record<string, unknown>),
    sourceUrl: row.sourceUrl ?? undefined,
    jobId: row.id,
  };
}

export async function resolveResume(
  deps: MatchDeps,
  userId: string,
  resumeId?: string,
): Promise<Record<string, unknown> | null> {
  if (resumeId) {
    const [row] = await deps.db
      .select()
      .from(schema.resumeInformation)
      .where(eq(schema.resumeInformation.id, resumeId))
      .limit(1);
    return row ?? null;
  }
  const all = await deps.db
    .select()
    .from(schema.resumeInformation)
    .where(eq(schema.resumeInformation.userId, userId));
  return all.find((r: any) => r.isActive) ?? all.find((r: any) => r.isMaster) ?? all[0] ?? null;
}

async function saveMatchScore(
  deps: MatchDeps,
  args: {
    userId: string;
    jobId?: string;
    resumeId: string;
    score: number;
    recommendations: string;
  },
): Promise<void> {
  if (!args.jobId) return;
  try {
    await (deps.db.insert(schema.resumeMatchScores) as any)
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
  } catch (err) {
    // Caching is a nice-to-have; the score is already returned to the
    // caller. Log and move on.
    // eslint-disable-next-line no-console
    console.warn("[match] saveMatchScore failed:", err instanceof Error ? err.message : err);
  }
}

async function loadPriorRecommendations(
  deps: MatchDeps,
  args: { userId: string; jobId?: string; resumeId: string },
): Promise<string | undefined> {
  if (!args.jobId) return undefined;
  const [row] = await deps.db
    .select({ recommendations: schema.resumeMatchScores.recommendations })
    .from(schema.resumeMatchScores)
    .where(
      and(
        eq(schema.resumeMatchScores.userId, args.userId),
        eq(schema.resumeMatchScores.jobId, args.jobId),
        eq(schema.resumeMatchScores.resumeId, args.resumeId),
      ),
    )
    .limit(1);
  return row?.recommendations || undefined;
}

function recordUsageSafely(deps: MatchDeps, userId: string, featureKey: string, usage: LLMUsage) {
  if (!deps.recordUsage) return;
  try {
    void deps.recordUsage({ userId, featureKey, usage });
  } catch {
    // deliberately swallow — usage reporting can never break a request
  }
}

// ---------------------------------------------------------------------------
// handleAnalyze — score resume vs job
// ---------------------------------------------------------------------------

const ANALYZE_SYSTEM_PROMPT = `You are a professional resume analyst. Evaluate how well a resume matches a job description and return a JSON response.
Scoring criteria:
- Skills match (required skills present in resume): 40%
- Experience relevance (titles, industries, years): 30%
- Education and certifications: 15%
- Language and keywords match: 15%
Always return valid JSON with integer score 0-100 and actionable recommendations.`;

export async function handleAnalyze(
  deps: MatchDeps,
  viewerId: string | null,
  body: unknown,
): Promise<HandlerResult> {
  const auth = requireAuth(viewerId);
  if ("status" in auth) return auth;

  const parsed = MatchInputSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, "VALIDATION_ERROR", "Invalid request", parsed.error.flatten());
  }

  const resume = await resolveResume(deps, auth.userId, parsed.data.resumeId);
  if (!resume) return fail(404, "NOT_FOUND", "No resume found. Please create a resume first.");

  const job = await resolveJob(deps, parsed.data);
  if (!job) return fail(404, "NOT_FOUND", "Job not found. Track the job before scoring.");

  const resumeText = resumeContentToText(resume.content);
  const resumeId = resume.id as string;

  if (deps.llm) {
    try {
      const { data: result, usage } = await deps.llm.callJson(
        {
          systemPrompt: ANALYZE_SYSTEM_PROMPT,
          userMessage: `Job Description:\n${job.text}\n\n---\n\nResume:\n${resumeText}\n\n---\n\nReturn JSON: { "score": <0-100>, "summaryRecommendations": "<2-4 bullet points of key gaps and suggestions>" }`,
          responseFormat: "json_object",
          temperature: 0.3,
        },
        AnalyzeResponseSchema,
      );
      recordUsageSafely(deps, auth.userId, "match_analyze", usage);
      void saveMatchScore(deps, {
        userId: auth.userId,
        jobId: job.jobId,
        resumeId,
        score: result.score,
        recommendations: result.summaryRecommendations,
      });
      return ok({
        score: result.score,
        summaryRecommendations: result.summaryRecommendations,
        resumeId,
        sourceUrl: job.sourceUrl,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const { score, message } = keywordScore(job.text, resumeText);
      return ok({
        score,
        summaryRecommendations: message + `\n\n_LLM error: ${msg.slice(0, 300)}_`,
        resumeId,
        sourceUrl: job.sourceUrl,
      });
    }
  }

  const { score, message } = keywordScore(job.text, resumeText);
  return ok({
    score,
    summaryRecommendations: message,
    resumeId,
    sourceUrl: job.sourceUrl,
  });
}

// ---------------------------------------------------------------------------
// handleTailor — rewrite resume to match job
// ---------------------------------------------------------------------------

export async function handleTailor(
  deps: MatchDeps,
  viewerId: string | null,
  body: unknown,
): Promise<HandlerResult> {
  const auth = requireAuth(viewerId);
  if ("status" in auth) return auth;

  const parsed = MatchInputSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, "VALIDATION_ERROR", "Invalid request", parsed.error.flatten());
  }

  const resume = await resolveResume(deps, auth.userId, parsed.data.resumeId);
  if (!resume) return fail(404, "NOT_FOUND", "No resume found. Please create a resume first.");

  const job = await resolveJob(deps, parsed.data);
  if (!job) return fail(404, "NOT_FOUND", "Job not found. Track the job before scoring.");

  const resumeText = resumeContentToText(resume.content);
  const resumeId = resume.id as string;

  if (deps.llm) {
    try {
      const prior = await loadPriorRecommendations(deps, {
        userId: auth.userId,
        jobId: job.jobId,
        resumeId,
      });
      const priorSection = prior ? `\n\nPRIOR SCORE ANALYSIS (address these specific gaps):\n${prior}\n` : "";

      const systemPrompt = `You are an expert resume writer. Your job is to:
1. Score the original resume against the job (0-100)
2. Rewrite the resume in Markdown to better match the job requirements
3. Score the rewritten resume (should be higher)
4. Summarize the key changes made
${prior ? "\nIMPORTANT: A prior analysis identified specific gaps and recommendations (included below the resume). You MUST directly address each of these gaps in your rewrite. Prioritize fixing the identified weaknesses over generic improvements." : ""}

Rules:
- Keep the same person's real experience — do not fabricate jobs or degrees
- Reorder and rephrase bullet points to highlight relevant skills
- Add missing keywords naturally where experience supports it
- Use a professional Markdown resume format with sections: Summary, Experience, Skills, Education
- Return valid JSON only`;

      const { data: result, usage } = await deps.llm.callJson(
        {
          systemPrompt,
          userMessage: `Job Description:\n${job.text}\n\n---\n\nOriginal Resume:\n${resumeText}${priorSection}\n\n---\n\nReturn JSON: { "oldScore": <0-100>, "newScore": <0-100>, "markdownResume": "<full tailored resume in Markdown>", "summaryRecommendations": "<3-5 bullet points summarising changes>" }`,
          responseFormat: "json_object",
          temperature: 0.5,
        },
        TailorResponseSchema,
      );
      recordUsageSafely(deps, auth.userId, "match_tailor", usage);
      return ok({
        ...result,
        resumeId,
        sourceUrl: job.sourceUrl,
      });
    } catch (err) {
      // Fall through to the keyword-overlap fallback.
      // eslint-disable-next-line no-console
      console.warn("[match/tailor] LLM failed:", err instanceof Error ? err.message : err);
    }
  }

  return ok({
    oldScore: 0,
    newScore: 0,
    markdownResume: `# Resume\n\n${resumeText}`,
    summaryRecommendations: "AI tailoring unavailable — using keyword overlap as a rough estimate.",
    resumeId,
    sourceUrl: job.sourceUrl,
  });
}

// ---------------------------------------------------------------------------
// handleByContent — analyze by raw strings (no persistence)
// ---------------------------------------------------------------------------

export async function handleByContent(
  deps: MatchDeps,
  viewerId: string | null,
  body: unknown,
): Promise<HandlerResult> {
  const auth = requireAuth(viewerId);
  if ("status" in auth) return auth;

  const parsed = MatchByContentSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, "VALIDATION_ERROR", "jobContent and resumeContent are required");
  }

  const jobText = parsed.data.jobContent.slice(0, TEXT_CAP);
  const resumeText = parsed.data.resumeContent.slice(0, TEXT_CAP);

  if (deps.llm) {
    try {
      const { data: result, usage } = await deps.llm.callJson(
        {
          systemPrompt:
            "You are a professional resume analyst. Evaluate how well a resume matches a job description and return valid JSON.",
          userMessage: `Job:\n${jobText}\n\n---\n\nResume:\n${resumeText}\n\n---\n\nReturn JSON: { "score": <0-100>, "summaryRecommendations": "<brief recommendations>" }`,
          responseFormat: "json_object",
          temperature: 0.3,
        },
        AnalyzeResponseSchema,
      );
      recordUsageSafely(deps, auth.userId, "match_bycontent", usage);
      return ok(result);
    } catch {
      // fall through
    }
  }

  const { score, message } = keywordScore(jobText, resumeText);
  return ok({ score, summaryRecommendations: message });
}
