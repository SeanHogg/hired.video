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
 *   • handleByContent — POST /api/match/bycontent (raw strings)
 *   • the job / résumé resolvers every fit flow shares.
 *
 * Tailor lives in tailor-edits.ts (pure: edit contract, prompt, apply) +
 * tailor-handler.ts (the use case).
 *
 * /byid + /insights will move in a follow-up; the LLM plumbing is the
 * same so adding them is mechanical.
 */

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import { schema } from "../../db/index.js";
import { buildRepos } from "../../repositories/index.js";
import { DomainError, requireUserId } from "../../domains/errors.js";
import type { LLMClient, LLMUsage } from "../../services/adapters/llm-client.js";
import { defineLenientIngest } from "../../services/adapters/llm-client.js";
import { coerceEnum } from "../../services/adapters/lenient-coerce.js";
import { coerceToString } from "./tailor-edits.js";
import { ANALYZE_SKILLS_PROMPT_FRAGMENT, AnalyzeSkillsSchema, keywordSkillLists } from "./match-skills.js";
import { resumeContentToText as resumeContentToTextShared } from "../../services/resume/parse.js";
import type { ParsedJob } from "../../services/job/JobService.js";
import {
  ResumeContentSchema,
  type ResumeContent,
} from "../../../../shared/resume.js";
import { logger } from "../../lib/logger.js";

export type DbPort = any;

export interface MatchDeps {
  db: DbPort;
  now: () => Date;
  /** LLM port — inject the prod client in routes, a fake in tests. The
   *  prod client charges `tokenLedger` automatically on every call, so
   *  handlers don't need a separate usage recorder. */
  llm: LLMClient | null;
  /** Seam for the cache-write side effect (`saveMatchScore`), which the
   *  handler runs detached so it never blocks the scored response. Prod
   *  leaves this undefined → the default fire-and-forget (`void task()`).
   *  Tests inject a capturing variant so they can await the REAL insert
   *  instead of guessing the async depth with a setTimeout/setImmediate
   *  tick (which raced the onConflict write under CI load). Mirrors the
   *  people-ops event sink's `runDetached`. */
  runDetached?: (task: () => Promise<unknown>) => void;
}

/** Run a side effect detached from the response path. Defaults to true
 *  fire-and-forget; `deps.runDetached` lets tests capture the promise. */
function detach(deps: MatchDeps, task: () => Promise<unknown>): void {
  (deps.runDetached ?? ((t) => void t()))(task);
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const MatchInputSchema = z
  .object({
    jobHtml: z.string().optional(),
    jobId: UuidLikeSchema.optional(),
    resumeId: UuidLikeSchema.optional(),
  })
  .refine((v) => !!(v.jobHtml || v.jobId), {
    message: "Either jobHtml or jobId is required",
  });

export const MatchByContentSchema = z.object({
  jobContent: z.string().min(1),
  resumeContent: z.string().min(1),
});

export const MatchByIdSchema = z.object({
  jobId: UuidLikeSchema,
  resumeId: UuidLikeSchema,
});

export const MatchInsightsSchema = z.object({
  jobHtml: z.string().min(1),
  resumeId: UuidLikeSchema.optional(),
});

export const AnalyzeResponseSchema = z.object({
  score: z.number().min(0).max(100),
  summaryRecommendations: coerceToString,
});

/** /analyze only: the same call also names matched / missing skills. */
const AnalyzeWithSkillsResponseSchema = AnalyzeResponseSchema.extend(AnalyzeSkillsSchema.shape);

export const InsightsResponseSchema = z.object({
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

// ─── Lenient ingest specs ─────────────────────────────────────────────────
//
// Free-tier models drift on the strict enums baked into InsightsResponse
// (`overallFit`, `missingSkills.importance`). Each spec owns a lenient wire
// schema where the drift-prone fields accept `string`, plus a `coerce` step
// that maps any free-form value onto a canonical bucket via the shared
// `coerceEnum` helper. The strict canonical schemas (above) stay in place at
// the storage / wire boundary — handlers receive the canonical shape from
// `callJsonLenient`.

const FIT_ALLOWED = ["strong", "good", "fair", "weak"] as const;
const FIT_ALIASES: Record<string, (typeof FIT_ALLOWED)[number]> = {
  excellent: "strong", great: "strong", high: "strong", veryhigh: "strong",
  ok: "good", okay: "good", solid: "good", moderate: "good", decent: "good", medium: "good",
  average: "fair", borderline: "fair", marginal: "fair",
  poor: "weak", low: "weak", bad: "weak", verylow: "weak", mismatch: "weak",
};

const SKILL_IMPORTANCE_ALLOWED = ["critical", "important", "nice-to-have"] as const;
const SKILL_IMPORTANCE_ALIASES: Record<string, (typeof SKILL_IMPORTANCE_ALLOWED)[number]> = {
  must: "critical", musthave: "critical", required: "critical", high: "critical", urgent: "critical",
  preferred: "important", medium: "important", moderate: "important", desired: "important",
  optional: "nice-to-have", low: "nice-to-have", bonus: "nice-to-have", nicetohave: "nice-to-have",
};

const LenientInsightsResponseSchema = z.object({
  overallFit: z.string().min(1),
  seniorityFit: z.string(),
  missingSkills: z.array(
    z.object({
      skill: z.string(),
      category: z.string(),
      importance: z.string().min(1),
    }),
  ),
  careerTrajectory: z.string(),
  interviewTips: z.array(z.string()),
  suggestedCertifications: z.array(z.object({ name: z.string(), reason: z.string() })),
  estimatedRampTime: z.string(),
});

export const InsightsResponseIngest = defineLenientIngest({
  name: "MatchInsightsResponse",
  ingest: LenientInsightsResponseSchema,
  coerce: (wire): z.infer<typeof InsightsResponseSchema> => ({
    ...wire,
    overallFit: coerceEnum(wire.overallFit, {
      allowed: FIT_ALLOWED,
      aliases: FIT_ALIASES,
      fallback: "fair",
    }),
    missingSkills: wire.missingSkills.map((s) => ({
      ...s,
      importance: coerceEnum(s.importance, {
        allowed: SKILL_IMPORTANCE_ALLOWED,
        aliases: SKILL_IMPORTANCE_ALIASES,
        fallback: "important",
      }),
    })),
  }),
});

// ---------------------------------------------------------------------------
// Pure helpers — exported for unit tests
// ---------------------------------------------------------------------------

/**
 * Hard cap applied to every flat-text input the LLM sees (job
 * descriptions, resume text, raw job HTML after tag stripping).
 *
 * Raised from 8K → 30K as part of the resume-tailor JSON pipeline:
 * the tailor path no longer flattens its inputs, but /analyze,
 * /bycontent, /byid, and /insights still pass text to the model. A
 * higher cap keeps long JDs + full resumes intact for those paths
 * (modern models comfortably accept 30K chars in a single message);
 * the cost is ~4× more prompt tokens per call in the worst case,
 * which we gate behind the per-feature token budget middleware.
 *
 * Not used by the JSON tailor path — that ships ParsedJob +
 * ResumeContent JSON directly, with no truncation.
 */
export const TEXT_CAP = 30_000;

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
 * /analyze and /bycontent can't drift.
 *
 * @deprecated for the tailor path. `/api/match/tailor` has moved to a
 *   JSON-preserving pipeline (`resolveJobV2` → `buildTailorPrompt`)
 *   gated by the `RESUME_TAILOR` env flag. Once that flag rolls out to
 *   100% and the comparison log shows no regression, this helper can be
 *   dropped from `handleTailorLegacy` entirely. It remains in use by
 *   `/analyze` and `/bycontent` for now — those endpoints still score
 *   against flat text and don't need structured output.
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

/**
 * Wrap the shared resume parser so TEXT_CAP applies consistently.
 *
 * @deprecated for the tailor path. `/api/match/tailor` now uses
 *   `resolveResumeV2` (returns the full `ResumeContent` JSON untouched)
 *   which keeps sections, highlights, and metadata intact for the
 *   JSON-preserving prompt. This flattener still powers `/analyze` and
 *   `/bycontent`; remove its use from `handleTailorLegacy` after
 *   `RESUME_TAILOR=true` is the permanent default.
 */
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

/**
 * JSON-preserving job resolver.
 *
 * Unlike `resolveJob`, this returns the structured `ParsedJob` payload
 * exactly as it was stored in `job_items.details` — no flattening, no
 * TEXT_CAP truncation, no `jobRowToLLMText` round-trip. Used by the
 * tailor JSON pipeline where we want the LLM to reason over
 * responsibilities/requirements arrays directly.
 *
 * The `details` JSONB column is the authoritative structured form; we
 * also merge in the few fields that live as first-class columns
 * (`title`, `company`, `location`, etc) so the LLM gets the full
 * picture even for old rows that only have the column-level data.
 *
 * Returns `null` when no row is found — the caller is responsible for
 * translating that to a 404.
 */
export interface ResolvedJobV2 {
  parsedJob: ParsedJob;
  sourceUrl?: string;
  jobId?: string;
}

/**
 * Project a `job_items` row into the structured `ParsedJob` shape used
 * by JSON-preserving prompts (tailor, skill-extractor, etc).
 *
 * Column-level values take priority over `details` because the columns
 * are canonical for the facet filters on the public job board
 * (jobType/experienceLevel/salary); `details` JSONB carries the
 * long-form structured bullets the Chrome extension extracted.
 *
 * Pure — no DB access. Callers do their own row fetch and pass it in.
 */
export function parsedJobFromRow(row: Record<string, unknown>): ParsedJob {
  const details = ((row as any).details ?? {}) as Partial<ParsedJob>;
  const skillsCol = (row as any).skillsRequired;
  return {
    title: String((row as any).title ?? details.title ?? ""),
    description: String((row as any).description ?? details.description ?? ""),
    company: (row as any).company ?? details.company ?? undefined,
    location: (row as any).location ?? details.location ?? undefined,
    city: details.city,
    state: details.state,
    country: details.country,
    isRemote: (row as any).isRemote ?? details.isRemote,
    jobType: (row as any).jobType ?? details.jobType ?? undefined,
    experienceLevel: (row as any).experienceLevel ?? details.experienceLevel ?? undefined,
    salaryMin:
      (row as any).salaryMin != null ? Number((row as any).salaryMin) : details.salaryMin,
    salaryMax:
      (row as any).salaryMax != null ? Number((row as any).salaryMax) : details.salaryMax,
    salaryCurrency: (row as any).salaryCurrency ?? details.salaryCurrency ?? undefined,
    skills: Array.isArray(skillsCol) && skillsCol.length > 0
      ? (skillsCol as string[])
      : details.skills,
    responsibilities: Array.isArray(details.responsibilities)
      ? details.responsibilities
      : undefined,
    requirements: Array.isArray(details.requirements) ? details.requirements : undefined,
    qualifications: Array.isArray(details.qualifications) ? details.qualifications : undefined,
    benefits: Array.isArray(details.benefits) ? details.benefits : undefined,
    applyUrl: (row as any).applyUrl ?? details.applyUrl ?? undefined,
    confidence: details.confidence ?? "high",
  };
}

export async function resolveJobV2(
  deps: MatchDeps,
  input: { jobId: string },
): Promise<ResolvedJobV2 | null> {
  if (!input.jobId) return null;

  const [row] = await deps.db
    .select()
    .from(schema.jobItems)
    .where(eq(schema.jobItems.id, input.jobId))
    .limit(1);
  if (!row) return null;

  return {
    parsedJob: parsedJobFromRow(row as Record<string, unknown>),
    sourceUrl: (row as any).sourceUrl ?? undefined,
    jobId: (row as any).id,
  };
}

/** The job a fit flow (tailor, create-from-a-job) works against: a tracked
 *  job by id, or pasted / fetched job text (synthesised, `confidence: low`). */
export async function resolveJobForFit(
  deps: MatchDeps,
  input: { jobId?: string; jobHtml?: string },
): Promise<{ parsedJob: ParsedJob; sourceUrl?: string; jobId?: string } | null> {
  if (input.jobId) {
    const resolved = await resolveJobV2(deps, { jobId: input.jobId });
    return resolved ? { parsedJob: resolved.parsedJob, sourceUrl: resolved.sourceUrl, jobId: resolved.jobId } : null;
  }
  if (input.jobHtml && input.jobHtml.trim().length > 0) {
    return { parsedJob: { title: "Untitled Job", description: htmlToPlainText(input.jobHtml), confidence: "low" } };
  }
  return null;
}

/**
 * JSON-preserving resume resolver.
 *
 * Returns the structured `ResumeContent` JSON from
 * `resume_information.content` unmodified — no flat-text projection,
 * no TEXT_CAP truncation. The caller can hand this straight to the LLM
 * as the `resume` input of the tailor prompt, or pass it back through
 * the `content` column when Save-as-Variation creates a new resume.
 *
 * Honors the same resume-selection semantics as `resolveResume`:
 *   • When `resumeId` is given, read that row by primary key.
 *   • Otherwise pick the active → master → first resume for the user.
 */
export interface ResolvedResumeV2 {
  content: ResumeContent;
  id: string;
  title: string;
}

export async function resolveResumeV2(
  deps: MatchDeps,
  userId: string,
  resumeId?: string,
): Promise<ResolvedResumeV2 | null> {
  const repo = buildRepos(deps.db).resumes;
  let row: any = null;
  if (resumeId) {
    // Owner-scoped: a résumé id is never enough to read someone else's
    // résumé into a tailor / match prompt (was an unscoped findById).
    row = await repo.findByIdForOwner(resumeId, userId);
  } else {
    const all = await repo.findAllForOwner(userId);
    row = all.find((r: any) => r.isActive) ?? all.find((r: any) => r.isMaster) ?? all[0] ?? null;
  }
  if (!row) return null;

  // Parse through ResumeContentSchema so missing arrays (education,
  // skills, work) pick up their declared defaults. Bad stored blobs
  // fall back to an empty-but-valid document rather than crashing
  // downstream validation.
  const parsed = ResumeContentSchema.safeParse(row.content);
  const content: ResumeContent = parsed.success ? parsed.data : ResumeContentSchema.parse({});

  return {
    content,
    id: String(row.id),
    title: String(row.title ?? ""),
  };
}

export async function resolveResume(
  deps: MatchDeps,
  userId: string,
  resumeId?: string,
): Promise<Record<string, unknown> | null> {
  const repo = buildRepos(deps.db).resumes;
  if (resumeId) {
    // Owner-scoped, same as resolveResumeV2: a résumé id alone must never
    // read someone else's résumé into a match / insights prompt.
    return (await repo.findByIdForOwner(resumeId, userId)) as Record<string, unknown> | null;
  }
  const all = await repo.findAllForOwner(userId);
  return (all.find((r: any) => r.isActive) ?? all.find((r: any) => r.isMaster) ?? all[0]) ?? null;
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
     
    logger.warn("[match] saveMatchScore failed", err);
  }
}

export async function loadPriorRecommendations(
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
) {
  const userId = requireUserId(viewerId);

  const parsed = MatchInputSchema.safeParse(body);
  if (!parsed.success) {
    throw new DomainError(400, "VALIDATION_ERROR", "Invalid request", parsed.error.flatten());
  }

  const resume = await resolveResume(deps, userId, parsed.data.resumeId);
  if (!resume) throw new DomainError(404, "NOT_FOUND", "No resume found. Please create a resume first.");

  const job = await resolveJob(deps, parsed.data);
  if (!job) throw new DomainError(404, "NOT_FOUND", "Job not found. Track the job before scoring.");

  const resumeText = resumeContentToText(resume.content);
  const resumeId = resume.id as string;

  if (deps.llm) {
    try {
      const { data: result } = await deps.llm.callJson(
        "match_analyze",
        {
          useCase: "match",
          systemPrompt: ANALYZE_SYSTEM_PROMPT,
          userMessage: `Job Description:\n${job.text}\n\n---\n\nResume:\n${resumeText}\n\n---\n\nReturn JSON: { "score": <0-100>, "summaryRecommendations": "<2-4 bullet points of key gaps and suggestions>", ${ANALYZE_SKILLS_PROMPT_FRAGMENT} }`,
          responseFormat: "json_object",
        },
        AnalyzeWithSkillsResponseSchema,
      );
      detach(deps, () => saveMatchScore(deps, {
        userId,
        jobId: job.jobId,
        resumeId,
        score: result.score,
        recommendations: result.summaryRecommendations,
      }));
      return {
        score: result.score,
        summaryRecommendations: result.summaryRecommendations,
        matchedSkills: result.matchedSkills,
        missingSkills: result.missingSkills,
        resumeId,
        sourceUrl: job.sourceUrl,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const { score, message } = keywordScore(job.text, resumeText);
      return {
        score,
        summaryRecommendations: message + `\n\n_LLM error: ${msg.slice(0, 300)}_`,
        ...keywordSkillLists(resume.content, job.text),
        resumeId,
        sourceUrl: job.sourceUrl,
      };
    }
  }

  const { score, message } = keywordScore(job.text, resumeText);
  return {
    score,
    summaryRecommendations: message,
    ...keywordSkillLists(resume.content, job.text),
    resumeId,
    sourceUrl: job.sourceUrl,
  };
}

// ---------------------------------------------------------------------------
// handleByid — analyze by persisted job + resume IDs (no jobHtml path)
// ---------------------------------------------------------------------------

export async function handleByid(
  deps: MatchDeps,
  viewerId: string | null,
  body: unknown,
) {
  const userId = requireUserId(viewerId);

  const parsed = MatchByIdSchema.safeParse(body);
  if (!parsed.success) {
    throw new DomainError(400, "VALIDATION_ERROR", "jobId and resumeId are required");
  }

  const { jobId, resumeId } = parsed.data;

  const job = await resolveJob(deps, { jobId });
  if (!job) throw new DomainError(404, "NOT_FOUND", "Job not found");

  const resume = await resolveResume(deps, userId, resumeId);
  if (!resume) throw new DomainError(404, "NOT_FOUND", "Resume not found");

  const resumeText = resumeContentToText(resume.content);

  if (deps.llm) {
    try {
      const { data: result } = await deps.llm.callJson(
        "match_byid",
        {
          useCase: "match",
          systemPrompt:
            "You are a professional resume analyst. Evaluate how well a resume matches a job description and return valid JSON.",
          userMessage: `Job:\n${job.text}\n\n---\n\nResume:\n${resumeText}\n\n---\n\nReturn JSON: { "score": <0-100>, "summaryRecommendations": "<brief recommendations>" }`,
          responseFormat: "json_object",
        },
        AnalyzeResponseSchema,
      );
      detach(deps, () => saveMatchScore(deps, {
        userId,
        jobId: job.jobId,
        resumeId: resume.id as string,
        score: result.score,
        recommendations: result.summaryRecommendations,
      }));
      return { ...result, jobId, resumeId };
    } catch {
      // fall through to keyword overlap
    }
  }

  const { score, message } = keywordScore(job.text, resumeText);
  return { score, summaryRecommendations: message, jobId, resumeId };
}

// ---------------------------------------------------------------------------
// handleInsights — deep career analysis (Pro only — the gate is
// applied at the route layer via requirePro middleware)
// ---------------------------------------------------------------------------

export async function handleInsights(
  deps: MatchDeps,
  viewerId: string | null,
  body: unknown,
) {
  const userId = requireUserId(viewerId);

  const parsed = MatchInsightsSchema.safeParse(body);
  if (!parsed.success) {
    throw new DomainError(400, "VALIDATION_ERROR", "Invalid request", parsed.error.flatten());
  }

  const resume = await resolveResume(deps, userId, parsed.data.resumeId);
  if (!resume) throw new DomainError(404, "NOT_FOUND", "No resume found. Please create a resume first.");

  const jobText = htmlToPlainText(parsed.data.jobHtml).slice(0, TEXT_CAP);
  const resumeText = resumeContentToText(resume.content);

  if (!deps.llm) {
    throw new DomainError(503, "AI_ERROR", "AI service not configured. Please contact support.");
  }

  try {
    const { data: result } = await deps.llm.callJsonLenient(
      "match_insights",
      {
        useCase: "match_insights",
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
      },
      InsightsResponseIngest,
    );

    return { ...result, resumeId: resume.id };
  } catch {
    throw new DomainError(500, "AI_ERROR", "Failed to generate insights. Please try again.");
  }
}

// ---------------------------------------------------------------------------
// handleByContent — analyze by raw strings (no persistence)
// ---------------------------------------------------------------------------

export async function handleByContent(
  deps: MatchDeps,
  viewerId: string | null,
  body: unknown,
) {
  requireUserId(viewerId);

  const parsed = MatchByContentSchema.safeParse(body);
  if (!parsed.success) {
    throw new DomainError(400, "VALIDATION_ERROR", "jobContent and resumeContent are required");
  }

  const jobText = parsed.data.jobContent.slice(0, TEXT_CAP);
  const resumeText = parsed.data.resumeContent.slice(0, TEXT_CAP);

  if (deps.llm) {
    try {
      const { data: result } = await deps.llm.callJson(
        "match_bycontent",
        {
          useCase: "match",
          systemPrompt:
            "You are a professional resume analyst. Evaluate how well a resume matches a job description and return valid JSON.",
          userMessage: `Job:\n${jobText}\n\n---\n\nResume:\n${resumeText}\n\n---\n\nReturn JSON: { "score": <0-100>, "summaryRecommendations": "<brief recommendations>" }`,
          responseFormat: "json_object",
        },
        AnalyzeResponseSchema,
      );
      return result;
    } catch {
      // fall through
    }
  }

  const { score, message } = keywordScore(jobText, resumeText);
  return { score, summaryRecommendations: message };
}
