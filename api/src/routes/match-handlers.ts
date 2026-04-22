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
import type { ParsedJob } from "../services/job.js";
import {
  ResumeContentSchema,
  type ResumeContent,
} from "../../../shared/resume.js";
import { renderMarkdownFromJsonResume } from "../../../shared/resume-markdown.js";

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
  /**
   * Feature-flag toggle for the JSON-preserving tailor pipeline.
   *
   * When true the facade returns the JSON-path result (tailoredResume +
   * changes[]) from the tailor endpoint. When false (default) it keeps
   * returning the legacy markdownResume-only shape. Both paths are
   * always executed in parallel regardless of this flag so we can
   * compare outputs in logs; the flag only controls which path's
   * result is shipped to the client.
   *
   * Wired from the Cloudflare Worker `RESUME_TAILOR` env var in
   * routes/match.ts.
   */
  tailorJsonEnabled?: boolean;
  /**
   * Emitter for the structured comparison log produced by the tailor
   * facade. Tests inject a spy to assert the log shape; prod wires it
   * to `console.log` (stdout → Cloudflare Workers logpush).
   */
  logTailor?: (entry: TailorComparisonLog) => void;
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

export const TailorResponseSchema = z.object({
  oldScore: z.number().min(0).max(100),
  newScore: z.number().min(0).max(100),
  markdownResume: z.string(),
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
 * JSON-preserving tailor response.
 *
 * Extends the legacy `TailorResponseSchema` (markdownResume +
 * summaryRecommendations + scores) with:
 *   - `tailoredResume`: the full JSON Resume document, directly
 *     writable to `resume_information.content` for Save-as-Variation;
 *   - `changes[]`: per-edit justifications.
 *
 * `markdownResume` is kept for backward compatibility with existing
 * clients; the frontend will prefer `tailoredResume` when present and
 * render markdown locally via renderMarkdownFromJsonResume.
 */
export const TailorResponseSchemaV2 = z.object({
  oldScore: z.number().min(0).max(100),
  newScore: z.number().min(0).max(100),
  markdownResume: z.string(),
  tailoredResume: ResumeContentSchema,
  changes: z.array(TailorChangeSchema).default([]),
  summaryRecommendations: coerceToString,
});
export type TailorResponseV2 = z.infer<typeof TailorResponseSchemaV2>;

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
  let row: any = null;
  if (resumeId) {
    const [r] = await deps.db
      .select()
      .from(schema.resumeInformation)
      .where(eq(schema.resumeInformation.id, resumeId))
      .limit(1);
    row = r ?? null;
  } else {
    const all = await deps.db
      .select()
      .from(schema.resumeInformation)
      .where(eq(schema.resumeInformation.userId, userId));
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
- Also produce a markdownResume field with the full tailored resume rendered as Markdown, for backward compatibility with older clients.

OUTPUT — return JSON exactly matching this shape (no code fences, no commentary):
{
  "oldScore": <number 0-100>,
  "newScore": <number 0-100>,
  "markdownResume": "<full tailored resume in Markdown>",
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
// Comparison logging — used by the facade to record both paths' results
// so we can analyse quality/cost before flipping the env flag.
// ---------------------------------------------------------------------------

interface TailorPathResult {
  duration: number;
  tokenUsage: number;
  oldScore: number;
  newScore: number;
  workEntryCount: number;
  success: boolean;
  error?: string;
}

export interface TailorLegacyResult extends TailorPathResult {
  markdownResumeLength: number;
}

export interface TailorJsonResult extends TailorPathResult {
  validationPassed: boolean;
  missingWorkEntries: string[];
  changesCount: number;
  tailoredResumeSize: number;
  attempts: number;
}

export interface TailorComparisonLog {
  correlationId: string;
  timestamp: string;
  jobId?: string;
  resumeId: string;
  envFlag: boolean;
  legacy: TailorLegacyResult;
  json: TailorJsonResult;
  selectedPath: "legacy" | "json";
}

/**
 * Emit the structured tailor comparison log. Prod routes this to
 * Cloudflare Workers stdout (which ships to Logpush / Analytics
 * Engine); tests inject a spy through `deps.logTailor` so they can
 * assert on the log shape without scraping console output.
 */
export function logTailorComparison(deps: MatchDeps, entry: TailorComparisonLog): void {
  if (deps.logTailor) {
    try {
      deps.logTailor(entry);
      return;
    } catch {
      // fall through to stdout so we don't silently drop the log
    }
  }
  try {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        level: "info",
        type: "tailor_comparison",
        ...entry,
      }),
    );
  } catch {
    // Logging must never throw — swallow stringify failures.
  }
}

// ---------------------------------------------------------------------------
// handleTailor — facade + legacy + JSON paths
// ---------------------------------------------------------------------------

/** Internal envelope so the facade can pick a path without re-parsing. */
interface TailorLegacyInternal {
  handler: HandlerResult;
  metrics: TailorLegacyResult;
}

interface TailorJsonInternal {
  handler: HandlerResult;
  metrics: TailorJsonResult;
}

/**
 * Facade for POST /api/match/tailor.
 *
 * Runs the legacy and JSON paths in parallel via `Promise.allSettled`
 * so one throwing can't cascade into the other's result. Emits a
 * structured comparison log with both paths' metrics (duration, token
 * usage, validation outcomes, score deltas) regardless of which result
 * is returned. The `tailorJsonEnabled` flag (fed from the
 * `RESUME_TAILOR` env var) picks the shipped result.
 *
 * If the selected path failed but the other succeeded, we fall back to
 * the survivor — the user gets a usable tailor either way. The log
 * captures the degraded selection so rollout dashboards stay honest.
 */
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

  // Both paths resolve the same resume/job — hold the IDs for logging.
  // Each sub-handler re-reads through its own resolver (V1 flat vs V2
  // JSON) so neither path contaminates the other's contract.
  const [legacyResult, jsonResult] = await Promise.allSettled([
    handleTailorLegacy(deps, auth.userId, parsed.data),
    handleTailorJson(deps, auth.userId, parsed.data),
  ]);

  const legacy: TailorLegacyInternal | null =
    legacyResult.status === "fulfilled" ? legacyResult.value : null;
  const json: TailorJsonInternal | null =
    jsonResult.status === "fulfilled" ? jsonResult.value : null;

  const envFlag = !!deps.tailorJsonEnabled;

  // Pick the selected path; fall back to the other when the primary
  // failed (either threw or surfaced a non-200 handler). We check
  // metrics.success rather than handler.status because a 400
  // VALIDATION_ERROR from the JSON path is still a "failure" worth
  // falling back from — the legacy path might well produce a useful
  // markdown resume in that case.
  const isUsable = (
    side: TailorLegacyInternal | TailorJsonInternal | null,
  ): side is TailorLegacyInternal | TailorJsonInternal =>
    !!side && side.metrics.success === true && side.handler.status === 200;

  let selectedPath: "legacy" | "json" = envFlag ? "json" : "legacy";
  const primary = selectedPath === "json" ? json : legacy;
  const secondary = selectedPath === "json" ? legacy : json;
  let chosen: HandlerResult | null = null;
  if (isUsable(primary)) {
    chosen = primary.handler;
  } else if (isUsable(secondary)) {
    selectedPath = selectedPath === "json" ? "legacy" : "json";
    chosen = secondary.handler;
  } else {
    // Both failed. Prefer surfacing the primary's handler so the
    // caller's error message reflects the requested pipeline. (Using
    // a locally-cast any to sidestep the false-negative narrowing
    // TypeScript applies after two consecutive type-guard failures.)
    const p = primary as TailorLegacyInternal | TailorJsonInternal | null;
    const s = secondary as TailorLegacyInternal | TailorJsonInternal | null;
    chosen = p?.handler ?? s?.handler ?? null;
  }

  // Build the comparison log even on one-sided failure. Missing sides
  // get zeroed metrics with the error message — dashboards can filter
  // on `success:false` to watch for regressions.
  const legacyMetrics: TailorLegacyResult = legacy
    ? legacy.metrics
    : {
        duration: 0,
        tokenUsage: 0,
        oldScore: 0,
        newScore: 0,
        workEntryCount: 0,
        success: false,
        error:
          legacyResult.status === "rejected"
            ? String(legacyResult.reason instanceof Error ? legacyResult.reason.message : legacyResult.reason)
            : "no result",
        markdownResumeLength: 0,
      };
  const jsonMetrics: TailorJsonResult = json
    ? json.metrics
    : {
        duration: 0,
        tokenUsage: 0,
        oldScore: 0,
        newScore: 0,
        workEntryCount: 0,
        success: false,
        error:
          jsonResult.status === "rejected"
            ? String(jsonResult.reason instanceof Error ? jsonResult.reason.message : jsonResult.reason)
            : "no result",
        validationPassed: false,
        missingWorkEntries: [],
        changesCount: 0,
        tailoredResumeSize: 0,
        attempts: 0,
      };

  logTailorComparison(deps, {
    correlationId: randomCorrelationId(),
    timestamp: new Date().toISOString(),
    jobId: parsed.data.jobId,
    resumeId: parsed.data.resumeId ?? "(auto)",
    envFlag,
    legacy: legacyMetrics,
    json: jsonMetrics,
    selectedPath,
  });

  if (!chosen) {
    return fail(500, "TAILOR_FAILED", "Tailor pipeline failed for both paths", {
      legacyError: legacyMetrics.error,
      jsonError: jsonMetrics.error,
    });
  }

  // Tag the winning response with metadata so the frontend can branch
  // on "did I get the JSON body or the markdown body". We only augment
  // the success envelope; error responses pass through unchanged.
  if (chosen.status === 200 && chosen.body && typeof chosen.body === "object") {
    const body = chosen.body as any;
    if (body.success && body.data && typeof body.data === "object") {
      body.data.processingPath = selectedPath;
    }
  }

  return chosen;
}

/**
 * Cheap correlation id — 128 bits of entropy, hex-encoded. crypto.randomUUID
 * is available in Cloudflare Workers so we don't need to import anything.
 */
function randomCorrelationId(): string {
  try {
    // @ts-ignore — crypto.randomUUID in Workers runtime
    return crypto.randomUUID();
  } catch {
    return `tailor-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * Legacy tailor path — identical logic to the original handleTailor,
 * extracted so the facade can call it in parallel with the JSON path
 * and the comparison logger can record its metrics without scraping.
 */
export async function handleTailorLegacy(
  deps: MatchDeps,
  userId: string,
  data: z.infer<typeof MatchInputSchema>,
): Promise<TailorLegacyInternal> {
  const started = Date.now();

  const resume = await resolveResume(deps, userId, data.resumeId);
  if (!resume) {
    return {
      handler: fail(404, "NOT_FOUND", "No resume found. Please create a resume first."),
      metrics: baseLegacyMetrics({ success: false, error: "resume not found", duration: Date.now() - started }),
    };
  }

  const job = await resolveJob(deps, data);
  if (!job) {
    return {
      handler: fail(404, "NOT_FOUND", "Job not found. Track the job before scoring."),
      metrics: baseLegacyMetrics({ success: false, error: "job not found", duration: Date.now() - started }),
    };
  }

  const resumeText = resumeContentToText(resume.content);
  const resumeId = resume.id as string;
  const resumeWorkCount = Array.isArray((resume.content as any)?.work)
    ? ((resume.content as any).work as unknown[]).length
    : 0;

  if (deps.llm) {
    try {
      const prior = await loadPriorRecommendations(deps, {
        userId,
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
      recordUsageSafely(deps, userId, "match_tailor", usage);
      return {
        handler: ok({
          ...result,
          resumeId,
          sourceUrl: job.sourceUrl,
        }),
        metrics: {
          duration: Date.now() - started,
          tokenUsage: usage.totalTokens ?? 0,
          oldScore: result.oldScore,
          newScore: result.newScore,
          workEntryCount: resumeWorkCount,
          success: true,
          markdownResumeLength: result.markdownResume.length,
        },
      };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[match/tailor/legacy] LLM failed:", err instanceof Error ? err.message : err);
      // Fall through to the keyword-overlap fallback.
    }
  }

  const fallback = ok({
    oldScore: 0,
    newScore: 0,
    markdownResume: `# Resume\n\n${resumeText}`,
    summaryRecommendations: "AI tailoring unavailable — using keyword overlap as a rough estimate.",
    resumeId,
    sourceUrl: job.sourceUrl,
  });
  return {
    handler: fallback,
    metrics: {
      duration: Date.now() - started,
      tokenUsage: 0,
      oldScore: 0,
      newScore: 0,
      workEntryCount: resumeWorkCount,
      success: true,
      error: "llm unavailable — keyword fallback",
      markdownResumeLength: (fallback.body as any)?.data?.markdownResume?.length ?? 0,
    },
  };
}

function baseLegacyMetrics(
  overrides: Partial<TailorLegacyResult> & { duration: number },
): TailorLegacyResult {
  return {
    duration: overrides.duration,
    tokenUsage: 0,
    oldScore: 0,
    newScore: 0,
    workEntryCount: 0,
    success: false,
    markdownResumeLength: 0,
    ...overrides,
  };
}

/**
 * JSON-preserving tailor path.
 *
 * Resolves job + resume as structured JSON, builds a JSON-in-JSON
 * prompt, calls the LLM with temperature 0.2, validates that every
 * work/education entry from the input survived, and retries once with
 * a strengthened prompt if validation fails.
 *
 * Returns the full `TailorResponseV2` shape on success:
 * `tailoredResume` is the JSON Resume the client can write straight
 * to `resume_information.content`, `markdownResume` is kept for
 * backward compat, and `changes[]` lists every justified edit.
 *
 * On total failure (both attempts fail validation or the LLM errors
 * out) returns a 400 VALIDATION_ERROR with the specific missing-entry
 * list so the caller can surface it.
 */
export async function handleTailorJson(
  deps: MatchDeps,
  userId: string,
  data: z.infer<typeof MatchInputSchema>,
): Promise<TailorJsonInternal> {
  const started = Date.now();

  // JSON pipeline only supports persisted jobs (details JSONB). If the
  // caller passed a raw jobHtml blob, fall back to the legacy resolver
  // for a lightweight ParsedJob — we don't want the JSON path to be a
  // second-class citizen just because the frontend called with HTML.
  let parsedJob: ParsedJob | null = null;
  let sourceUrl: string | undefined;
  let jobIdResolved: string | undefined;

  if (data.jobId) {
    const resolved = await resolveJobV2(deps, { jobId: data.jobId });
    if (!resolved) {
      return {
        handler: fail(404, "NOT_FOUND", "Job not found. Track the job before scoring."),
        metrics: baseJsonMetrics({ success: false, error: "job not found", duration: Date.now() - started }),
      };
    }
    parsedJob = resolved.parsedJob;
    sourceUrl = resolved.sourceUrl;
    jobIdResolved = resolved.jobId;
  } else if (data.jobHtml && data.jobHtml.trim().length > 0) {
    // Synthesize a minimal ParsedJob from HTML so the JSON prompt still
    // has structured-ish input. We don't run the LLM classifier here
    // (that's a separate endpoint) — tag confidence as "low" so the
    // downstream prompt can hint at it if needed.
    parsedJob = {
      title: "Untitled Job",
      description: htmlToPlainText(data.jobHtml),
      confidence: "low",
    };
  } else {
    return {
      handler: fail(400, "VALIDATION_ERROR", "Either jobHtml or jobId is required"),
      metrics: baseJsonMetrics({ success: false, error: "no job input", duration: Date.now() - started }),
    };
  }

  const resumeV2 = await resolveResumeV2(deps, userId, data.resumeId);
  if (!resumeV2) {
    return {
      handler: fail(404, "NOT_FOUND", "No resume found. Please create a resume first."),
      metrics: baseJsonMetrics({ success: false, error: "resume not found", duration: Date.now() - started }),
    };
  }

  const workCount = resumeV2.content.work.length;

  if (!deps.llm) {
    // No LLM available — JSON path has no keyword-fallback because we
    // can't synthesize a valid ResumeContent from nowhere. Surface the
    // condition; the facade will fall back to the legacy path result.
    return {
      handler: fail(503, "AI_ERROR", "AI tailoring unavailable: no LLM configured"),
      metrics: baseJsonMetrics({
        success: false,
        error: "llm unavailable",
        duration: Date.now() - started,
        workEntryCount: workCount,
      }),
    };
  }

  const prior = jobIdResolved
    ? await loadPriorRecommendations(deps, {
        userId,
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
  let totalTokens = 0;
  let lastValidation: TailorValidationResult | null = null;
  let lastError: string | undefined;

  while (attempt < maxAttempts) {
    attempt++;
    try {
      const { data: result, usage } = await deps.llm.callJson(
        prompt,
        TailorResponseSchemaV2,
      );
      totalTokens += usage.totalTokens ?? 0;

      const validation = validateTailorOutput(resumeV2.content, result.tailoredResume);
      lastValidation = validation;

      if (validation.valid) {
        recordUsageSafely(deps, userId, "match_tailor", usage);

        // Regenerate markdownResume deterministically from the JSON so
        // the two fields can't disagree on the shipped content. The
        // LLM's own markdownResume field is retained only as a
        // freshness signal; we prefer our renderer.
        const renderedMarkdown = renderMarkdownFromJsonResume(result.tailoredResume);

        return {
          handler: ok({
            oldScore: result.oldScore,
            newScore: result.newScore,
            markdownResume: renderedMarkdown,
            tailoredResume: result.tailoredResume,
            changes: result.changes,
            summaryRecommendations: result.summaryRecommendations,
            resumeId: resumeV2.id,
            sourceUrl,
          }),
          metrics: {
            duration: Date.now() - started,
            tokenUsage: totalTokens,
            oldScore: result.oldScore,
            newScore: result.newScore,
            workEntryCount: result.tailoredResume.work.length,
            success: true,
            validationPassed: true,
            missingWorkEntries: [],
            changesCount: result.changes.length,
            tailoredResumeSize: JSON.stringify(result.tailoredResume).length,
            attempts: attempt,
          },
        };
      }

      // Validation failed — strengthen the prompt for the next round
      // and loop. Stop after `maxAttempts` total calls.
      prompt = strengthenPrompt(prompt, validation);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.warn("[match/tailor/json] LLM call failed:", lastError);
      // On hard LLM/schema failures (not just validation), bail early —
      // retry is unlikely to help when the provider is throwing.
      break;
    }
  }

  return {
    handler: fail(
      400,
      "VALIDATION_ERROR",
      "Tailored resume failed validation after retries",
      {
        errors: lastValidation?.errors ?? [lastError ?? "unknown failure"],
        missingWorkEntries: lastValidation?.missingWorkEntries ?? [],
        missingEducationInstitutions: lastValidation?.missingEducationInstitutions ?? [],
      },
    ),
    metrics: {
      duration: Date.now() - started,
      tokenUsage: totalTokens,
      oldScore: 0,
      newScore: 0,
      workEntryCount: workCount,
      success: false,
      error: lastError ?? lastValidation?.errors.join("; "),
      validationPassed: false,
      missingWorkEntries: lastValidation?.missingWorkEntries ?? [],
      changesCount: 0,
      tailoredResumeSize: 0,
      attempts: attempt,
    },
  };
}

function baseJsonMetrics(
  overrides: Partial<TailorJsonResult> & { duration: number },
): TailorJsonResult {
  return {
    duration: overrides.duration,
    tokenUsage: 0,
    oldScore: 0,
    newScore: 0,
    workEntryCount: 0,
    success: false,
    validationPassed: false,
    missingWorkEntries: [],
    changesCount: 0,
    tailoredResumeSize: 0,
    attempts: 0,
    ...overrides,
  };
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
// handleInsights — deep career analysis (Premium only — the gate is
// applied at the route layer via requirePremium middleware)
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
