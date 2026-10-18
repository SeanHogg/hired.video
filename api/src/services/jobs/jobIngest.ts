/**
 * Job ingest use cases — every path that turns raw content into a tracked
 * job row (routes/jobs/ingest.ts):
 *
 *   • createJobFromFile   — POST /createfromfile (file upload / pasted JD)
 *   • extractJobFromPage  — POST /extract (Chrome extension page capture)
 *   • refreshTrackedJob   — POST /:id/refresh (backfill missing fields)
 *
 * All three run the same extractAndClassifyJob pipeline so every job —
 * regardless of ingress path — lands with the same structured shape.
 */
import { getDb } from "../../db/index.js";
import { buildRepos } from "../../repositories/index.js";
import type { JobInsert } from "../../repositories/jobsRepository.js";
import { DomainError } from "../../domains/errors.js";
import type { LLMClient } from "../adapters/llm-client.js";
import { htmlToMarkdown } from "../../../../shared/scraping/index.js";
import { HIRED_VIDEO_SEED_COMPANY } from "../job/job-seed-company.js";
import { deduplicateJob } from "../job/job-dedup.js";
import { createTrackedJob } from "../job/job-write.js";
import type { ParsedJob } from "../job/job-page-parse.js";
import { enrichParsedWithLLM, extractAndClassifyJob } from "../job/job-classify.js";
import { deriveApplyUrl } from "../job/job-apply-url.js";
import { computeRefreshBackfill } from "../job/job-refresh-backfill.js";
import { saveJob } from "../job/job-saved.js";

/** A use-case answer whose success status varies by outcome. */
export interface StatusedResult {
  status: 200 | 201;
  data: unknown;
}

/** Create a tracked job from uploaded / pasted text. */
export async function createJobFromFile(
  payload: { title: string; description: string; location: string | undefined },
  userId: string,
  llm: LLMClient | null,
): Promise<Awaited<ReturnType<typeof createTrackedJob>>> {
  if (!payload.description.trim()) {
    throw new DomainError(400, "VALIDATION_ERROR", "File contained no readable text");
  }

  // Feed the file text through the unified extraction pipeline. No JSON-LD
  // will match (it's not HTML), so this routes straight to the LLM
  // classifier which returns the structured ParsedJob shape.
  const result = await extractAndClassifyJob({
    html: payload.description,
    llm,
  });

  // If the LLM rejects the content (e.g. a resume was uploaded instead of a
  // job), keep the user's content anyway — we still have their filename as
  // a title and the raw text as a description. The extension-path does the
  // same "fall open" on extractor failure.
  const parsed: ParsedJob = result.parsed ?? {
    title: payload.title,
    description: payload.description,
    confidence: "low" as const,
  };
  if (!parsed.title || /^tracked job$/i.test(parsed.title) || /^job from /i.test(parsed.title)) {
    parsed.title = payload.title;
  }
  if (payload.location && !parsed.location) parsed.location = payload.location;

  return createTrackedJob(
    {
      title: parsed.title,
      description: parsed.description,
      company: parsed.company,
      location: parsed.location,
      isRemote: parsed.isRemote,
      jobType: parsed.jobType,
      experienceLevel: parsed.experienceLevel,
      salaryMin: parsed.salaryMin,
      salaryMax: parsed.salaryMax,
      salaryCurrency: parsed.salaryCurrency,
      skills: parsed.skills,
      responsibilities: parsed.responsibilities,
      requirements: parsed.requirements,
      qualifications: parsed.qualifications,
      benefits: parsed.benefits,
    },
    userId,
    { track: true },
  );
}

export interface ExtractJobInput {
  userId: string;
  html: string;
  sourceUrl: string;
  track: boolean;
  force: boolean;
  /** DOM-detection hints from the content script — fallbacks when AI
   *  extraction struggles with noisy HTML. Empty string = absent. */
  hintTitle: string;
  hintCompany: string;
  hintLocation: string;
  llm: LLMClient | null;
}

/**
 * Track a job from a captured webpage.
 *
 *   1. Parse structured data (JSON-LD → OG → heuristics → AI classifier).
 *   2. Run the 3-layer dedup pipeline (normalized URL → content hash →
 *      fuzzy ILIKE → AI duplicate confirmation). Exact / AI-confirmed fuzzy
 *      match → bookmark + return it (200). Ambiguous candidates → 200 with
 *      `{ duplicate_candidates }` so the extension can ask "did you mean?";
 *      it re-submits with `force: true` to skip dedup.
 *   3. Create the new job and bookmark it (201).
 */
export async function extractJobFromPage(input: ExtractJobInput): Promise<StatusedResult> {
  const { userId, html, sourceUrl, track, force, hintTitle, hintCompany, hintLocation, llm } = input;

  // ---- Step 1: classify the page --------------------------------
  const result = await extractAndClassifyJob({
    url: sourceUrl,
    html,
    llm,
  });

  let parsed: ParsedJob;
  if (!result.ok || !result.parsed) {
    // If AI extraction fails but we have hints from the content script,
    // create a minimal job from the hints + MD description rather than
    // rejecting the request entirely.
    if (!hintTitle) {
      throw new DomainError(422, "NOT_A_JOB_POSTING", result.reason || "This page doesn't look like a job posting.", {
        confidence: result.confidence,
      });
    }
    const markdown = htmlToMarkdown(html);
    // Try to extract the "About the job" section from the text.
    const aboutIdx = markdown.toLowerCase().indexOf("about the job");
    const descText =
      aboutIdx >= 0 ? markdown.slice(aboutIdx, aboutIdx + 8000).trim() : markdown.slice(0, 8000);
    parsed = {
      title: hintTitle,
      company: hintCompany || HIRED_VIDEO_SEED_COMPANY,
      location: hintLocation,
      description: descText,
      confidence: "low",
    };
  } else {
    parsed = result.parsed;
  }

  // Apply hints as fallbacks — content script DOM parsing is often more
  // accurate than AI extraction for title/company on obfuscated pages.
  if (hintTitle && (!parsed.title || parsed.title.toLowerCase().includes("job from"))) {
    parsed.title = hintTitle;
  }
  if (hintCompany && (!parsed.company || parsed.company === HIRED_VIDEO_SEED_COMPANY)) {
    parsed.company = hintCompany;
  }
  if (hintLocation && !parsed.location) {
    parsed.location = hintLocation;
  }

  const company = track ? parsed.company : HIRED_VIDEO_SEED_COMPANY;

  // ---- Step 2: dedup (skip when force=true — user confirmed "new") --
  if (!force) {
    const dedup = await deduplicateJob(
      {
        title: parsed.title,
        company,
        location: parsed.location,
        description: parsed.description?.slice(0, 1000),
        sourceUrl: sourceUrl || undefined,
      },
      llm,
    );

    // Exact match, or AI-confirmed fuzzy match — just bookmark the existing row.
    if ((dedup.outcome === "exact" || dedup.outcome === "fuzzy") && dedup.existingJob) {
      if (track) await saveJob(dedup.existingJob.id, userId);
      return {
        status: 200,
        data: {
          ...dedup.existingJob,
          applyUrl: deriveApplyUrl({
            parsed,
            job: dedup.existingJob,
            fallbackUrl: sourceUrl,
          }),
        },
      };
    }

    if (dedup.candidates && dedup.candidates.length > 0) {
      // Ambiguous fuzzy matches — return candidates so extension can
      // show a "did you mean?" prompt. Status 200 + special shape.
      return {
        status: 200,
        data: {
          duplicate_candidates: dedup.candidates.map((cand) => ({
            id: cand.id,
            title: cand.title,
            company: cand.company,
            location: cand.location,
            sourceUrl: cand.sourceUrl,
            createdAt: cand.createdAt,
          })),
          parsed_title: parsed.title,
          parsed_company: company,
        },
      };
    }
  }

  // ---- Step 3: create new job ------------------------------------
  const created = await createTrackedJob(
    {
      title: parsed.title,
      description: parsed.description,
      location: parsed.location,
      company,
      sourceUrl: sourceUrl || undefined,
      applyUrl: parsed.applyUrl,
      isRemote: parsed.isRemote,
      jobType: parsed.jobType,
      experienceLevel: parsed.experienceLevel,
      salaryMin: parsed.salaryMin,
      salaryMax: parsed.salaryMax,
      salaryCurrency: parsed.salaryCurrency,
      skills: parsed.skills,
      responsibilities: parsed.responsibilities,
      requirements: parsed.requirements,
      qualifications: parsed.qualifications,
      benefits: parsed.benefits,
    },
    userId,
    { track },
  );

  const applyUrl = deriveApplyUrl({ parsed, fallbackUrl: sourceUrl });
  return { status: 201, data: { ...created, applyUrl } };
}

/**
 * Backfill missing fields on a tracked job from freshly captured page HTML.
 * The client has already confirmed this page matches the stored job, so
 * there is no server-side mismatch check. Never overwrites a non-empty
 * stored value — this is a backfill, not a re-extract.
 */
export async function refreshTrackedJob(input: {
  userId: string;
  jobId: string;
  html: string;
  url: string;
  missingFields: string[] | null;
  llm: LLMClient | null;
}): Promise<Record<string, unknown>> {
  const { userId, jobId, html, url, missingFields, llm } = input;
  const jobs = buildRepos(getDb()).jobs;

  const row = await jobs.findJobById(jobId);
  if (!row) throw new DomainError(404, "NOT_FOUND", "Job not found");

  // Confirm the caller actually has this job in their tracker. Prevents a
  // random user from refreshing someone else's tracked job.
  if (!(await jobs.isJobSavedByUser(userId, jobId))) {
    throw new DomainError(403, "FORBIDDEN", "This job isn't in your tracker.");
  }

  // Re-extract from the posted HTML. Same pipeline as /extract, so hit
  // rates / fallbacks are consistent.
  const result = await extractAndClassifyJob({ url, html, llm });
  if (!result.ok || !result.parsed) {
    throw new DomainError(422, "EXTRACTION_FAILED", result.reason || "Could not extract job data from this page.");
  }
  let parsed = result.parsed;

  // JSON-LD-only extractions (confidence "high") often omit key fields
  // like jobType, salary, experienceLevel, skills — refresh is supposed
  // to fill them. If any of those are still empty after the first pass
  // and we have an API key, take a second pass with the LLM classifier
  // to fill the holes. Heuristic wins on conflict.
  const needsEnrichment =
    !parsed.jobType ||
    !parsed.experienceLevel ||
    parsed.salaryMin == null ||
    parsed.salaryMax == null ||
    !(parsed.skills && parsed.skills.length > 0) ||
    !(parsed.benefits && parsed.benefits.length > 0);
  if (llm && needsEnrichment) {
    parsed = await enrichParsedWithLLM(parsed, { url, html, llm });
  }

  // Merge policy lives in JobService so it can be unit-tested without
  // spinning up Hono + DB. See computeRefreshBackfill() for the exact rules
  // (never overwrite, honor missingFields allow-list, per-key details merging).
  const { updates, updatedFields } = computeRefreshBackfill({
    row,
    parsed,
    url,
    missingFields,
  });

  if (updatedFields.length === 0) {
    // Nothing to do — return the row as-is so the client can no-op gracefully.
    return {
      ...row,
      applyUrl: deriveApplyUrl({ parsed, job: row, fallbackUrl: url }),
      updated: false,
      updatedFields: [],
    };
  }

  // updateJobById stamps updatedAt.
  const updatedRow = await jobs.updateJobById(jobId, updates as Partial<JobInsert>);

  return {
    ...updatedRow,
    applyUrl: deriveApplyUrl({ parsed, job: updatedRow, fallbackUrl: url }),
    updated: true,
    updatedFields,
  };
}
