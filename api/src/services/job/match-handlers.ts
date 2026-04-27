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
import { schema } from "../../db/index.js";
import { buildRepos } from "../../repositories/index.js";
import { ok, fail, requireAuth, type HandlerResult } from "../../handlers/shared.js";
import type { LLMClient } from "../../services/adapters/llm-client.js";
import type { LLMUsage } from "../../services/adapters/ai.js";
import { resumeContentToText as resumeContentToTextShared } from "../../services/resume/parse.js";
import type { ParsedJob } from "../../services/job/JobService.js";
import {
  ResumeContentSchema,
  type ResumeContent,
} from "../../../../shared/resume.js";
import { saveVariationFromContent } from "../../services/resume/ResumeService.js";

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

export const MatchByIdSchema = z.object({
  jobId: z.string().uuid(),
  resumeId: z.string().uuid(),
});

export const MatchInsightsSchema = z.object({
  jobHtml: z.string().min(1),
  resumeId: z.string().uuid().optional(),
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

/**
 * One atomic edit the LLM made to the resume. Every modification the
 * tailor step produces MUST show up as a change with a human-readable
 * justification — this is what lets us display "why did that bullet
 * move?" diffs in the UI and audit LLM behavior.
 *
 * `section` is constrained to the ResumeContent top-level keys so a
 * change can always be located back to the structured document.
 */
export const TailorChangeSchema = z.object({
  section: z.enum([
    "basics",
    "work",
    "education",
    "skills",
    "projects",
    "volunteer",
    "awards",
    "certificates",
    "publications",
    "languages",
    "interests",
    "references",
  ]),
  before: z.string(),
  after: z.string(),
  why: z.string(),
});
export type TailorChange = z.infer<typeof TailorChangeSchema>;

/**
 * LLM-output schema for the tailor endpoint. The model returns the full
 * tailored resume as JSON (not markdown) plus a changes[] list and a
 * summary; the server then persists the JSON as a variation and echoes
 * it back to the caller. No markdown is ever shipped — every consumer
 * renders from the structured `tailoredResume` field.
 */
export const TailorResponseSchema = z.object({
  oldScore: z.number().min(0).max(100),
  newScore: z.number().min(0).max(100),
  tailoredResume: ResumeContentSchema,
  changes: z.array(TailorChangeSchema).default([]),
  summaryRecommendations: coerceToString,
});
export type TailorResponse = z.infer<typeof TailorResponseSchema>;

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

  const details = ((row as any).details ?? {}) as Partial<ParsedJob>;
  const skillsCol = (row as any).skillsRequired;

  // Build the ParsedJob. Column-level values take priority over details
  // because the columns are canonical for the facet filters on the
  // public job board (jobType/experienceLevel/salary); details[] carries
  // the long-form structured bullets the Chrome extension extracted.
  const parsedJob: ParsedJob = {
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

  return {
    parsedJob,
    sourceUrl: (row as any).sourceUrl ?? undefined,
    jobId: (row as any).id,
  };
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
    row = await repo.findById(resumeId);
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
    return (await repo.findById(resumeId)) as Record<string, unknown> | null;
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
// Tailor — JSON pipeline helpers
//
// The tailor endpoint has two implementations today:
//
//   • handleTailorLegacy — the original flat-text pipeline. Flattens the
//     job and the resume to plain strings, asks the LLM for a Markdown
//     resume, returns { markdownResume, summaryRecommendations, scores }.
//     Kept for backward compatibility and for the parallel-comparison
//     log that drives the RESUME_TAILOR rollout.
//
//   • handleTailorJson — the JSON-preserving pipeline. Ships the
//     ParsedJob + ResumeContent JSON to the LLM, requires a full
//     tailoredResume JSON back along with justified changes[], and
//     validates that every input work/education entry survived the
//     rewrite. Retries once with a strengthened prompt on validation
//     failure. This is the path that makes "Save as Variation" a
//     one-line pass-through.
//
// `handleTailor` is a thin facade: it runs both paths in parallel,
// logs a structured comparison record, and returns the result selected
// by the `tailorJsonEnabled` flag (wired from the `RESUME_TAILOR`
// Cloudflare env var in routes/match.ts).
// ---------------------------------------------------------------------------

/** Result envelope used by the JSON validator. */
export interface TailorValidationResult {
  valid: boolean;
  errors: string[];
  /** Work entry `name` values present in the input but dropped in the output. */
  missingWorkEntries: string[];
  /** Education `institution` values present in the input but dropped in the output. */
  missingEducationInstitutions: string[];
}

/**
 * Validate that the LLM-tailored resume preserves every work and
 * education entry from the input. The whole point of the JSON pipeline
 * is that the LLM is not allowed to drop jobs — if it does, we retry
 * with a stronger prompt.
 *
 * Also Zod-validates the output against `ResumeContentSchema` so we
 * catch shape drift (wrong field types, missing required sub-fields)
 * before anything reaches the client or the DB.
 *
 * Pure — no I/O, no mutation. Returns a single structured result so
 * the retry/prompt-strengthening code can branch on what went wrong.
 */
export function validateTailorOutput(
  input: ResumeContent,
  output: unknown,
): TailorValidationResult {
  const errors: string[] = [];
  const missingWorkEntries: string[] = [];
  const missingEducationInstitutions: string[] = [];

  const parsed = ResumeContentSchema.safeParse(output);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    errors.push(`Schema validation failed: ${issues}`);
    return { valid: false, errors, missingWorkEntries, missingEducationInstitutions };
  }

  const outputData = parsed.data;

  // Work entries — preserve every company/name. Compare case-
  // insensitively and trim so the LLM "Acme" vs "acme " doesn't count
  // as a drop; the original casing still survives through whatever
  // entry does match.
  const norm = (s: string) => s.trim().toLowerCase();
  const outputWorkNames = new Set(
    (outputData.work ?? []).map((w) => norm(w.name ?? "")).filter((s) => s.length > 0),
  );
  for (const w of input.work ?? []) {
    const name = (w.name ?? "").trim();
    if (!name) continue;
    if (!outputWorkNames.has(norm(name))) {
      missingWorkEntries.push(name);
      errors.push(`Missing work entry: ${name}`);
    }
  }

  const outputInstitutions = new Set(
    (outputData.education ?? [])
      .map((e) => norm(e.institution ?? ""))
      .filter((s) => s.length > 0),
  );
  for (const e of input.education ?? []) {
    const institution = (e.institution ?? "").trim();
    if (!institution) continue;
    if (!outputInstitutions.has(norm(institution))) {
      missingEducationInstitutions.push(institution);
      errors.push(`Missing education entry: ${institution}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    missingWorkEntries,
    missingEducationInstitutions,
  };
}

/** Strongly-typed prompt envelope for the JSON-preserving tailor call. */
export interface TailorPromptInput {
  job: ParsedJob;
  resume: ResumeContent;
  priorRecommendations?: string;
}

export interface TailorPromptOutput {
  systemPrompt: string;
  userMessage: string;
  responseFormat: "json_object";
  temperature: number;
}

const TAILOR_JSON_SYSTEM_PROMPT = `You are an expert resume writer. Your job is to:
1. Score the original resume against the job (0-100).
2. Tailor the resume JSON to better match the job requirements.
3. Score the tailored resume (should be higher than the original).
4. Document every change you make with a justification.

CRITICAL RULES — violations are rejected and retried:
- Preserve ALL work experiences. Never remove an entry from work[]. Never change a company's "name".
- Preserve ALL education entries. Never remove an entry from education[]. Never change an institution's "institution".
- Reorder and rephrase work[].highlights to emphasise skills and keywords the job requires.
- Add missing keywords naturally when the candidate's actual experience supports them; never fabricate employers, degrees, titles, or metrics.
- Keep the JSON Resume shape intact — every section the input had must survive in the output.
- Populate the changes[] array with one entry per modification, each with a before/after snippet and a why justification.

OUTPUT — return JSON exactly matching this shape (no code fences, no commentary):
{
  "oldScore": <number 0-100>,
  "newScore": <number 0-100>,
  "tailoredResume": <full JSON Resume object with basics/work/education/skills/...>,
  "changes": [{ "section": "<basics|work|education|skills|projects|volunteer|awards|certificates|publications|languages|interests|references>", "before": "<original text or JSON fragment>", "after": "<modified text or JSON fragment>", "why": "<1 sentence justification>" }],
  "summaryRecommendations": "<3-5 bullet points describing the biggest changes>"
}`;

/**
 * Build the JSON-in-JSON tailor prompt. The job + resume go into the
 * user message as pretty-printed JSON so the LLM can reason about
 * structure (sections, arrays, nested objects) rather than having to
 * re-derive it from a flat text blob.
 *
 * Temperature is pinned at 0.2 — this is a structured-output task, not
 * a creative one, and a low temperature keeps the retry rate down.
 */
export function buildTailorPrompt(input: TailorPromptInput): TailorPromptOutput {
  const { job, resume, priorRecommendations } = input;

  const jobJson = JSON.stringify(job, null, 2);
  const resumeJson = JSON.stringify(resume, null, 2);

  const priorSection = priorRecommendations
    ? `\n\nPRIOR ANALYSIS (address these gaps — each one MUST be fixed in the tailored resume):\n${priorRecommendations}\n`
    : "";

  const userMessage = [
    "JOB (JSON):",
    jobJson,
    "",
    "RESUME (JSON):",
    resumeJson,
    priorSection,
    "",
    "Return valid JSON matching the output schema. The tailoredResume MUST include every work[].name and education[].institution from the input resume.",
  ].join("\n");

  return {
    systemPrompt: TAILOR_JSON_SYSTEM_PROMPT,
    userMessage,
    responseFormat: "json_object",
    temperature: 0.2,
  };
}

/**
 * Append validation-failure details to an existing tailor prompt so
 * the retry call has a fighting chance of fixing the specific errors
 * the first attempt made.
 *
 * We only mutate the `userMessage` — the system prompt's hard rules
 * already forbid dropping entries; the goal here is to surface the
 * concrete list of names the LLM lost so it can put them back.
 */
export function strengthenPrompt(
  prompt: TailorPromptOutput,
  validation: TailorValidationResult,
): TailorPromptOutput {
  const parts: string[] = [
    "",
    "VALIDATION FAILURE — the previous attempt violated the preservation rules. Fix ALL of the issues below in your next response:",
  ];
  for (const err of validation.errors) parts.push(`  - ${err}`);
  if (validation.missingWorkEntries.length > 0) {
    parts.push("");
    parts.push(
      `You MUST include the following work entries (match the "name" field exactly): ${validation.missingWorkEntries
        .map((n) => `"${n}"`)
        .join(", ")}`,
    );
  }
  if (validation.missingEducationInstitutions.length > 0) {
    parts.push(
      `You MUST include the following education institutions: ${validation.missingEducationInstitutions
        .map((n) => `"${n}"`)
        .join(", ")}`,
    );
  }

  return {
    ...prompt,
    userMessage: `${prompt.userMessage}\n${parts.join("\n")}`,
  };
}

// ---------------------------------------------------------------------------
// handleTailor — tailor the resume AND save it as a variation in one shot.
//
// One network call from the client, one consolidated response. The endpoint
// owns the full workflow:
//   1. Resolve the source resume + job (structured JSON, no flat-text).
//   2. Call the LLM with retry-on-validation-failure (max 2 attempts).
//   3. Validate the tailored JSON preserves every work/education entry.
//   4. Persist the tailored resume as a variation under the source's
//      master via the shared `saveVariationFromContent` helper.
//   5. Return `{ oldScore, newScore, tailoredResume, changes,
//      summaryRecommendations, variationId, variationTitle, sourceUrl }`.
//
// No markdown is shipped — every consumer renders from `tailoredResume`.
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

  // Resolve the job as structured ParsedJob. jobId → persisted row;
  // jobHtml → lightweight synthesized job with `confidence: "low"` so
  // the prompt can hint at degraded structure.
  let parsedJob: ParsedJob | null = null;
  let sourceUrl: string | undefined;
  let jobIdResolved: string | undefined;

  if (parsed.data.jobId) {
    const resolved = await resolveJobV2(deps, { jobId: parsed.data.jobId });
    if (!resolved) return fail(404, "NOT_FOUND", "Job not found. Track the job before scoring.");
    parsedJob = resolved.parsedJob;
    sourceUrl = resolved.sourceUrl;
    jobIdResolved = resolved.jobId;
  } else if (parsed.data.jobHtml && parsed.data.jobHtml.trim().length > 0) {
    parsedJob = {
      title: "Untitled Job",
      description: htmlToPlainText(parsed.data.jobHtml),
      confidence: "low",
    };
  } else {
    return fail(400, "VALIDATION_ERROR", "Either jobHtml or jobId is required");
  }

  const resumeV2 = await resolveResumeV2(deps, auth.userId, parsed.data.resumeId);
  if (!resumeV2) return fail(404, "NOT_FOUND", "No resume found. Please create a resume first.");

  if (!deps.llm) {
    return fail(503, "AI_ERROR", "AI tailoring unavailable: no LLM configured");
  }

  const prior = jobIdResolved
    ? await loadPriorRecommendations(deps, {
        userId: auth.userId,
        jobId: jobIdResolved,
        resumeId: resumeV2.id,
      })
    : undefined;

  let prompt = buildTailorPrompt({
    job: parsedJob,
    resume: resumeV2.content,
    priorRecommendations: prior,
  });

  const maxAttempts = 2;
  let attempt = 0;
  let lastValidation: TailorValidationResult | null = null;
  let lastError: string | undefined;

  while (attempt < maxAttempts) {
    attempt++;
    try {
      const { data: result, usage } = await deps.llm.callJson(
        prompt,
        TailorResponseSchema,
      );

      const validation = validateTailorOutput(resumeV2.content, result.tailoredResume);
      lastValidation = validation;

      if (!validation.valid) {
        prompt = strengthenPrompt(prompt, validation);
        continue;
      }

      recordUsageSafely(deps, auth.userId, "match_tailor", usage);

      // Persist the tailored resume as a variation under the source's
      // master. Title is derived from the job so the extension table
      // and the web resume list both show something meaningful
      // (e.g. "Staff SWE – Acme").
      const variationTitle = buildVariationTitle(parsedJob);
      const repos = buildRepos(deps.db).resumes;
      const saveOutcome = await saveVariationFromContent(
        repos,
        auth.userId,
        resumeV2.id,
        {
          content: result.tailoredResume as unknown as Record<string, unknown>,
          title: variationTitle,
          description: jobIdResolved ? `Generated for ${parsedJob.title}` : undefined,
        },
      );

      if (!saveOutcome.ok) {
        // Lookup or heal failed — the LLM output was valid but the
        // persistence step rejected it. Surface a 500 so the client
        // knows the tailor itself succeeded; they can re-try from the
        // same source resume.
        return fail(
          500,
          "VARIATION_SAVE_FAILED",
          saveOutcome.code === "NOT_FOUND"
            ? "Source resume no longer exists"
            : "Tailored resume failed validation on save",
          saveOutcome.code === "INVALID_CONTENT"
            ? { issues: saveOutcome.issues }
            : undefined,
        );
      }

      return ok({
        oldScore: result.oldScore,
        newScore: result.newScore,
        tailoredResume: result.tailoredResume,
        changes: result.changes,
        summaryRecommendations: result.summaryRecommendations,
        resumeId: resumeV2.id,
        sourceUrl,
        variationId: saveOutcome.row!.id,
        variationTitle,
      });
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.warn("[match/tailor] LLM call failed:", lastError);
      // Hard LLM/schema failure — retry won't help when the provider
      // is the one breaking. Bail early.
      break;
    }
  }

  // When the LLM error was a rate-limit/timeout cascade (not a
  // validation failure), surface the real cause instead of a misleading
  // VALIDATION_ERROR. OpenRouter's free-tier providers frequently all
  // 429 at once — the caller should retry later, not fix their resume.
  if (lastError && isAiUnavailableError(lastError)) {
    return fail(
      503,
      "AI_UNAVAILABLE",
      "AI providers are temporarily overloaded or rate-limited. Please try again in a minute.",
      { providerError: lastError.slice(0, 2000) },
    );
  }

  return fail(
    400,
    "VALIDATION_ERROR",
    "Tailored resume failed validation after retries",
    {
      errors: lastValidation?.errors ?? [lastError ?? "unknown failure"],
      missingWorkEntries: lastValidation?.missingWorkEntries ?? [],
      missingEducationInstitutions: lastValidation?.missingEducationInstitutions ?? [],
    },
  );
}

/** True when every model in the OpenRouter fallback chain failed with
 *  rate-limit or timeout errors (i.e. the cause is infrastructure, not
 *  LLM output). The shape of the aggregated "All LLM models failed"
 *  error string is produced by `callLLMWithUsage`. */
function isAiUnavailableError(msg: string): boolean {
  if (!msg.includes("All LLM models failed")) return false;
  // Split the aggregated error into per-model lines and check that
  // EVERY line is an upstream failure (429 / 404 / timeout). If even
  // one line is something else (e.g. a schema parse error), the
  // problem is real and we want to surface the validation path.
  const lines = msg.split("\n").filter((l) => l.trim().startsWith("["));
  if (lines.length === 0) return false;
  return lines.every(
    (l) =>
      l.includes("429") ||
      l.includes("404") ||
      /aborted due to timeout/i.test(l) ||
      /rate.?limit/i.test(l),
  );
}

/** Build the variation title from the job metadata. Shared format so
 *  the extension, web app, and resume list all display the same string. */
function buildVariationTitle(job: ParsedJob): string {
  const title = (job.title ?? "").trim() || "Tailored Resume";
  const company = (job.company ?? "").trim();
  const combined = company ? `${title} - ${company}` : title;
  return combined.slice(0, 250);
}

// ---------------------------------------------------------------------------
// handleByid — analyze by persisted job + resume IDs (no jobHtml path)
// ---------------------------------------------------------------------------

export async function handleByid(
  deps: MatchDeps,
  viewerId: string | null,
  body: unknown,
): Promise<HandlerResult> {
  const auth = requireAuth(viewerId);
  if ("status" in auth) return auth;

  const parsed = MatchByIdSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, "VALIDATION_ERROR", "jobId and resumeId are required");
  }

  const { jobId, resumeId } = parsed.data;

  const job = await resolveJob(deps, { jobId });
  if (!job) return fail(404, "NOT_FOUND", "Job not found");

  const resume = await resolveResume(deps, auth.userId, resumeId);
  if (!resume) return fail(404, "NOT_FOUND", "Resume not found");

  const resumeText = resumeContentToText(resume.content);

  if (deps.llm) {
    try {
      const { data: result, usage } = await deps.llm.callJson(
        {
          systemPrompt:
            "You are a professional resume analyst. Evaluate how well a resume matches a job description and return valid JSON.",
          userMessage: `Job:\n${job.text}\n\n---\n\nResume:\n${resumeText}\n\n---\n\nReturn JSON: { "score": <0-100>, "summaryRecommendations": "<brief recommendations>" }`,
          responseFormat: "json_object",
          temperature: 0.3,
        },
        AnalyzeResponseSchema,
      );
      recordUsageSafely(deps, auth.userId, "match_byid", usage);
      void saveMatchScore(deps, {
        userId: auth.userId,
        jobId: job.jobId,
        resumeId: resume.id as string,
        score: result.score,
        recommendations: result.summaryRecommendations,
      });
      return ok({ ...result, jobId, resumeId });
    } catch {
      // fall through to keyword overlap
    }
  }

  const { score, message } = keywordScore(job.text, resumeText);
  return ok({ score, summaryRecommendations: message, jobId, resumeId });
}

// ---------------------------------------------------------------------------
// handleInsights — deep career analysis (Pro only — the gate is
// applied at the route layer via requirePro middleware)
// ---------------------------------------------------------------------------

export async function handleInsights(
  deps: MatchDeps,
  viewerId: string | null,
  body: unknown,
): Promise<HandlerResult> {
  const auth = requireAuth(viewerId);
  if ("status" in auth) return auth;

  const parsed = MatchInsightsSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, "VALIDATION_ERROR", "Invalid request", parsed.error.flatten());
  }

  const resume = await resolveResume(deps, auth.userId, parsed.data.resumeId);
  if (!resume) return fail(404, "NOT_FOUND", "No resume found. Please create a resume first.");

  const jobText = htmlToPlainText(parsed.data.jobHtml).slice(0, TEXT_CAP);
  const resumeText = resumeContentToText(resume.content);

  if (!deps.llm) {
    return fail(503, "AI_ERROR", "AI service not configured. Please contact support.");
  }

  try {
    const { data: result, usage } = await deps.llm.callJson(
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

    recordUsageSafely(deps, auth.userId, "match_insights", usage);
    return ok({ ...result, resumeId: resume.id });
  } catch {
    return fail(500, "AI_ERROR", "Failed to generate insights. Please try again.");
  }
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
