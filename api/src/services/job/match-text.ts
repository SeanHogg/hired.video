/**
 * Match-domain pure text helpers — LLM text inputs (TEXT_CAP, HTML strip,
 * job-row / résumé flattening) and the keyword-overlap fallback scorer.
 * Split out of match-handlers.ts (now a re-export facade).
 */
import { resumeContentToText as resumeContentToTextShared } from "../../services/resume/parse.js";

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
