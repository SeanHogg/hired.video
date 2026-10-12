/**
 * Resume Summarize — pure handler.
 *
 * The Hono route at routes/resumes.ts is a thin adapter over this
 * module. The split exists so unit tests can exercise the input-shape
 * branches (paste-text vs parsed-JSON vs resumeId) and the validation
 * gate without booting the LLM facade or the real DB.
 *
 * The original `/api/resume/summarize` stub silently dropped two of the
 * three input shapes the frontend already sent (parsed-JSON object and
 * resumeId), which is why the broken behaviour shipped: the test in
 * tools-api.test.ts was a pure mirror of the stub's logic. Tests in
 * resume-summarize.test.ts now cover each input branch independently.
 */

import { renderMarkdownFromJsonResume } from "../../../../shared/resume-markdown.js";
import type { ResumeContent } from "../../../../shared/resume.js";

export const SUMMARY_SYSTEM_PROMPT = `You are a professional resume summariser. Read the resume and produce a concise, recruiter-ready summary.

Rules:
- 3 short paragraphs, ~200–300 words total.
- Paragraph 1: who the candidate is — current role / seniority + headline strengths.
- Paragraph 2: standout achievements with concrete numbers / impact where present in the resume.
- Paragraph 3: skill mix and the kind of role they're a strong fit for.
- Plain prose. No markdown headings. No bullet lists.
- Do NOT invent facts or fill gaps with platitudes — if a section is sparse, say less.`;

/** Minimum chars of resume content we'll spend tokens on. Below this we
 *  return a 422 — the LLM can't produce a useful summary from less. */
export const MIN_RESUME_CHARS = 20;

/** Hard cap we send to the LLM. Anything longer is truncated client-side
 *  before the prompt is built — guards against runaway token spend on
 *  pathological inputs. */
export const MAX_RESUME_CHARS = 12000;

/** Discriminated input — exactly one of the three frontend shapes, plus
 *  an `empty` fallthrough for missing/garbage bodies. */
export type SummarizeInput =
  | { kind: "text"; resumeText: string }
  | { kind: "object"; resumeContent: ResumeContent }
  | { kind: "id"; resumeId: string }
  | { kind: "empty" };

/**
 * Classify the request body into one of the input shapes the frontend
 * sends. Order matters:
 *   - resumeText as string takes precedence over resumeText as object
 *     (a paste-text user shouldn't accidentally trip the JSON path).
 *   - resumeText (any shape) takes precedence over resumeId (the
 *     paste-text and file-upload tabs both clear resumeId before
 *     submitting).
 */
export function classifySummarizeInput(body: unknown): SummarizeInput {
  if (!body || typeof body !== "object") return { kind: "empty" };
  const b = body as Record<string, unknown>;
  if (typeof b.resumeText === "string") {
    return { kind: "text", resumeText: b.resumeText };
  }
  if (b.resumeText && typeof b.resumeText === "object") {
    return { kind: "object", resumeContent: b.resumeText as ResumeContent };
  }
  if (typeof b.resumeId === "string" && b.resumeId.length > 0) {
    return { kind: "id", resumeId: b.resumeId };
  }
  return { kind: "empty" };
}

/** Subset of the resume repo this handler depends on. We accept any row
 *  shape that carries a `content` JSONB blob — the production
 *  `IResumeRepository.findByIdForOwner` returns the full ResumeRow which
 *  satisfies this, and the test fake supplies only `{ content }`. */
export interface SummarizeRepoPort {
  findByIdForOwner(
    id: string,
    ownerId: string,
  ): Promise<{ content: unknown } | null>;
}

export type ResolvedResume =
  | { ok: true; resumeText: string }
  | { ok: false; status: 404 | 422; code: string; message: string };

/**
 * Resolve the request body to the markdown text we hand to the LLM.
 * Returns a discriminated result so the route adapter can map it to a
 * Hono response without re-implementing the validation rules.
 */
export async function resolveResumeForSummary(
  repo: SummarizeRepoPort,
  input: SummarizeInput,
  ownerId: string | undefined,
): Promise<ResolvedResume> {
  let text = "";
  switch (input.kind) {
    case "text":
      text = input.resumeText;
      break;
    case "object":
      text = renderMarkdownFromJsonResume(input.resumeContent);
      break;
    case "id": {
      if (!ownerId) {
        return {
          ok: false,
          status: 422,
          code: "VALIDATION_ERROR",
          message: "Sign in to summarise a saved resume.",
        };
      }
      const row = await repo.findByIdForOwner(input.resumeId, ownerId);
      if (!row) {
        return { ok: false, status: 404, code: "RESUME_NOT_FOUND", message: "Resume not found." };
      }
      text = renderMarkdownFromJsonResume(row.content as ResumeContent);
      break;
    }
    case "empty":
      break;
  }
  if (text.trim().length < MIN_RESUME_CHARS) {
    return {
      ok: false,
      status: 422,
      code: "VALIDATION_ERROR",
      message: "Resume content is too short or empty.",
    };
  }
  return { ok: true, resumeText: text };
}

/**
 * Deterministic summary used when no LLM key is configured or the LLM
 * call throws. Honest about being a fallback rather than pretending to
 * be a summary — the original stub's "Summary: <first 240 chars>" was a
 * lie that masked the missing implementation for months.
 */
export function buildDeterministicSummary(text: string): string {
  const trimmed = text.trim();
  const head = trimmed.slice(0, 600);
  return (
    "AI summarisation is unavailable right now, so here's an excerpt of the resume:\n\n" +
    head +
    (trimmed.length > 600 ? "..." : "")
  );
}
