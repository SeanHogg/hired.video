/**
 * handleCoverLetter — POST /api/match/cover-letter: write the cover letter
 * for a résumé tailored to a job.
 *
 *   1. Resolve the job (tracked id or pasted text) — the same resolver the
 *      tailor uses, so both read the same posting.
 *   2. Take the résumé INLINE (`resumeContent`): the kit workspace sends exactly what is
 *      on screen — the tailored proposal with the person's confirmed gap
 *      answers applied — so the letter never cites a change they reverted.
 *   3. Ask the model for the shared `CoverLetter` shape (shared/cover-
 *      letter.ts). Evidence-only: every claim must come from the résumé.
 *
 * Persists nothing — the kit workspace stores the letter on the tailored version
 * (`content.meta.coverLetter`) when the person saves it.
 */
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import { ResumeContentSchema, type ResumeContent } from "../../../../shared/resume.js";
import { CoverLetterSchema, type CoverLetter } from "../../../../shared/cover-letter.js";
import { ok, fail, requireAuth, type HandlerResult } from "../../handlers/shared.js";
import { defineLenientIngest } from "../../services/adapters/llm-client.js";
import type { ParsedJob } from "../../services/job/JobService.js";
import { resolveJobForFit, type MatchDeps } from "./match-handlers.js";
import { failFromAiError } from "./tailor-handler.js";

export const CoverLetterInputSchema = z
  .object({
    jobHtml: z.string().optional(),
    jobId: UuidLikeSchema.optional(),
    resumeContent: ResumeContentSchema,
  })
  .refine((v) => !!(v.jobHtml || v.jobId), { message: "Either jobHtml or jobId is required" });

/** What the model returns. Permissive: free models send highlights as plain
 *  strings or paragraphs as one string; `coerce` normalises both. */
const paragraphs = z.union([z.string(), z.array(z.string())]).optional();
const CoverLetterWireSchema = z.object({
  jobTitle: z.string().optional(),
  organization: z.string().optional(),
  recipientLines: z.union([z.string(), z.array(z.string())]).optional(),
  salutation: z.string().optional(),
  opening: paragraphs,
  highlightsIntro: z.string().optional(),
  highlights: z
    .array(z.union([z.string(), z.object({ label: z.string().optional(), text: z.string().optional() })]))
    .optional(),
  closing: paragraphs,
  signOff: z.string().optional(),
});
type CoverLetterWire = z.infer<typeof CoverLetterWireSchema>;

const CoverLetterIngest = defineLenientIngest({
  name: "CoverLetter",
  ingest: CoverLetterWireSchema,
  coerce: (wire: CoverLetterWire): CoverLetterWire => wire,
});

/** Model paragraphs (an array, or one string split on blank lines) → trimmed, non-empty. */
export const toParagraphs = (v: string | string[] | undefined): string[] =>
  (Array.isArray(v) ? v : (v ?? "").split(/\n{2,}/)).map((s) => s.trim()).filter(Boolean);

/** Model highlights (plain strings or {label, text}) → the letter's shape, empties dropped. */
export function toHighlights(
  wire: Array<string | { label?: string; text?: string }> | undefined,
): CoverLetter["highlights"] {
  return (wire ?? [])
    .map((h) => (typeof h === "string" ? { label: "", text: h.trim() } : { label: (h.label ?? "").trim(), text: (h.text ?? "").trim() }))
    .filter((h) => h.text);
}

/** Wire → canonical. Pure; `date` is the server's, never the model's. */
export function toCoverLetter(wire: CoverLetterWire, date: string): CoverLetter | null {
  const highlights = toHighlights(wire.highlights);
  const parsed = CoverLetterSchema.safeParse({
    jobTitle: (wire.jobTitle ?? "").trim(),
    organization: (wire.organization ?? "").trim(),
    recipientLines: Array.isArray(wire.recipientLines) ? wire.recipientLines.map((s) => s.trim()).filter(Boolean) : (wire.recipientLines ?? "").split("\n").map((s) => s.trim()).filter(Boolean),
    salutation: (wire.salutation ?? "").trim() || "Dear Hiring Committee,",
    opening: toParagraphs(wire.opening),
    highlightsIntro: (wire.highlightsIntro ?? "").trim(),
    highlights,
    closing: toParagraphs(wire.closing),
    signOff: (wire.signOff ?? "").trim() || "Sincerely,",
    date,
  });
  return parsed.success ? parsed.data : null;
}

export const COVER_LETTER_SYSTEM_PROMPT = `You are an expert executive career writer. Write a one-page cover letter for the candidate's application to the job, using ONLY facts from the candidate's resume.

Return JSON exactly matching this shape (no code fences, no commentary):
{
  "jobTitle": "<the role as the posting names it>",
  "organization": "<the hiring organization as the posting names it>",
  "recipientLines": ["<addressee, e.g. 'Search Committee, <role> (Job No. <n>)' when a number is posted>", "<department / organization>", "<street>", "<city, state zip>"],
  "salutation": "<e.g. 'Dear Members of the Search Committee:'>",
  "opening": ["<one paragraph: the role applied for + the candidate's single strongest matching credential, with a number>"],
  "highlightsIntro": "<one sentence tying the posting's own priorities to the list below>",
  "highlights": [{ "label": "<the job's priority, 2-5 words>", "text": "<2-3 sentences of resume evidence for it, with numbers>" }],
  "closing": ["<one paragraph: why this organization's mission matters to the candidate, grounded in the resume>", "<one short paragraph: thanks + the ask>"],
  "signOff": "Sincerely,"
}

RULES:
- 3 to 5 highlights, each matching a DIFFERENT priority the posting stresses most (responsibilities, qualifications, knowledge/skills). Lead with the most important.
- Every claim, number, employer, title, tool and certification MUST appear in the resume. Never invent experience, sector history, degrees or locations. If the posting asks for something the resume does not show, leave it out — do not apologise for it or mention it.
- Use the posting's own vocabulary where the resume genuinely supports it.
- recipientLines: only what the posting states (organization, department, address, job number). Never invent a person's name; omit lines you don't know.
- Plain, confident, specific prose. Sentences under 25 words. No clichés ("I am writing to express my interest", "team player", "passionate"), no emoji, no markdown.
- Do not include the candidate's name or contact details, nor the date — the page adds them.
- Write in the same language as the job posting.`;

export function buildCoverLetterPrompt(job: ParsedJob, resume: ResumeContent) {
  return {
    useCase: "cover_letter" as const,
    systemPrompt: COVER_LETTER_SYSTEM_PROMPT,
    userMessage: ["JOB (JSON):", JSON.stringify(job, null, 2), "", "RESUME (JSON):", JSON.stringify(resume, null, 2)].join("\n"),
    responseFormat: "json_object" as const,
  };
}

export async function handleCoverLetter(deps: MatchDeps, viewerId: string | null, body: unknown): Promise<HandlerResult> {
  const auth = requireAuth(viewerId);
  if ("status" in auth) return auth;

  const parsed = CoverLetterInputSchema.safeParse(body);
  if (!parsed.success) return fail(400, "VALIDATION_ERROR", "Invalid request", parsed.error.flatten());

  const job = await resolveJobForFit(deps, parsed.data);
  if (!job) return fail(404, "NOT_FOUND", "Job not found");
  if (!deps.llm) return fail(503, "AI_UNAVAILABLE", "AI is not configured");

  const date = deps.now().toISOString().slice(0, 10);
  try {
    const { data } = await deps.llm.callJsonLenient(
      "cover_letter_generate",
      buildCoverLetterPrompt(job.parsedJob, parsed.data.resumeContent),
      CoverLetterIngest,
    );
    const letter = toCoverLetter(data, date);
    if (!letter) return fail(502, "AI_BAD_OUTPUT", "The AI returned an incomplete cover letter. Please try again.");
    return ok({ letter });
  } catch (err) {
    return failFromAiError(err, err instanceof Error ? err.message : String(err)) ?? fail(502, "AI_ERROR", "Cover letter generation failed");
  }
}
