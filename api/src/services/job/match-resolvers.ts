/**
 * Match-domain resolvers — the job / résumé lookups every fit flow shares.
 * DB access gated behind `deps.db`. Split out of match-handlers.ts (now a
 * re-export facade).
 */
import { eq } from "drizzle-orm";
import { schema } from "../../db/index.js";
import { buildRepos } from "../../repositories/index.js";
import type { ParsedJob } from "./job-page-parse.js";
import {
  ResumeContentSchema,
  type ResumeContent,
} from "../../../../shared/resume.js";
import type { MatchDeps } from "./match-deps.js";
import { TEXT_CAP, htmlToPlainText, jobRowToLLMText } from "./match-text.js";

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
