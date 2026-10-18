/**
 * Tailor — the prompt: build it, and strengthen it for a retry after a
 * validation failure or unmatched edits. Pure — no I/O. Split out of
 * tailor-edits.ts.
 */
import type { ParsedJob } from "./job-page-parse.js";
import type { ResumeContent } from "../../../../shared/resume.js";
import type { TailorValidationResult } from "./tailor-validation.js";
import type { EditSection } from "./tailor-apply.js";

/** Strongly-typed prompt envelope for the JSON-preserving tailor call. */
export interface TailorPromptInput {
  job: ParsedJob;
  resume: ResumeContent;
  priorRecommendations?: string;
}

export interface TailorPromptOutput {
  useCase: "match_tailor";
  systemPrompt: string;
  userMessage: string;
  responseFormat: "json_object";
}

const TAILOR_JSON_SYSTEM_PROMPT = `You are an expert resume writer. Tailor a candidate's resume to a job by returning a SMALL set of structured EDITS — never the whole resume.

Return JSON exactly matching this shape (no code fences, no commentary):
{
  "oldScore": <number 0-100>,     // the original resume's fit for the job
  "newScore": <number 0-100>,     // the fit after your edits (should be higher)
  "edits": [ ... ],               // ONLY the changes you make; omit anything left unchanged
  "gaps": [ ... ],                // what the job asks for that the resume shows NO evidence of
  "matchedKeywords": ["<kw>", ...], // up to 15 of the job's skills/keywords the resume ALREADY shows, in the job's words
  "summaryRecommendations": "<3-5 bullet points describing the biggest changes>"
}

Each entry in "gaps" (at most 5, most important first):
  { "requirement": "<as the job states it>", "kind": "skill"|"experience", "question": "<short question to the candidate>", "skill": "<skill name, kind=skill>", "section": "work"|"volunteer"|"projects", "match": "<exact entry name where an answer would belong, optional>" }

Each entry in "edits" is ONE of these shapes:
  { "op": "basics", "label": "<new headline>", "summary": "<new professional summary>", "why": "<1 sentence>" }
  { "op": "highlights", "section": "work"|"volunteer"|"projects", "match": "<exact name>", "highlights": ["<bullet>", ...], "why": "<1 sentence>" }
  { "op": "summary", "section": "work"|"volunteer"|"projects", "match": "<exact name>", "summary": "<new entry summary>", "why": "<1 sentence>" }
  { "op": "skills", "skills": [{ "name": "<skill>", "level": "<optional>", "keywords": ["<kw>", ...] }], "why": "<1 sentence>" }

RULES:
- "match" MUST be copied EXACTLY from the resume's work[].name, volunteer[].organization, or projects[].name — that is how the server locates the entry. An edit whose "match" is not found is ignored.
- For a "highlights" edit, return the FULL replacement list for that entry (reordered/rephrased), not a partial list.
- Reorder and rephrase to emphasise the skills and keywords the job requires, using the candidate's ACTUAL experience. Never invent employers, degrees, titles, dates, or metrics.
- Headline ("label"): name the target role's function and level in the job's own words when the resume's experience supports it (e.g. a former CIO applying for a CIO role).
- Professional summary: open with total years and the scope that matches the job's stated qualifications (team size, budget, savings, environments), then the 2-3 priorities the job stresses most, each backed by resume evidence. 3-5 sentences.
- Skills: regroup into categories named after the job's main responsibility areas (e.g. "Cybersecurity & Risk", "IT Operations & Service Delivery"), filled ONLY with skills the resume shows.
- Bullets: lead each entry with what the job cares about most; keep the numbers. Remove duplicate or near-duplicate bullets and finish truncated fragments within the same entry — every remaining bullet must be a complete sentence.
- You CANNOT remove or rename a job or school — there is no such operation; every part of the resume you do not edit is preserved verbatim.
- Emit an edit ONLY for something you actually change. Fewer, high-impact edits beat many trivial ones.
- NEVER add a skill, tool, domain or achievement the resume does not show. If the job wants it and the resume has no evidence, list it under "gaps" instead — the candidate will confirm it themselves.`;

/**
 * Build the tailor prompt. The job + resume go into the user message as
 * pretty-printed JSON so the LLM can reason about structure (sections,
 * arrays, nested objects) and copy exact `match` keys. The model returns a
 * compact edit list (gap #2109) — the server applies it via
 * `applyResumeEdits` and re-derives the full tailored document, so the
 * model never has to echo the whole resume back.
 *
 * Temperature comes from USE_CASE_PROFILES["match_tailor"] — this is a
 * structured-output task, not a creative one, so it's tuned cold there.
 */
export function buildTailorPrompt(input: TailorPromptInput): TailorPromptOutput {
  const { job, resume, priorRecommendations } = input;

  const jobJson = JSON.stringify(job, null, 2);
  const resumeJson = JSON.stringify(resume, null, 2);

  const priorSection = priorRecommendations
    ? `\n\nPRIOR ANALYSIS (address these gaps — each one MUST be reflected in your edits):\n${priorRecommendations}\n`
    : "";

  const userMessage = [
    "JOB (JSON):",
    jobJson,
    "",
    "RESUME (JSON):",
    resumeJson,
    priorSection,
    "",
    "Return JSON with oldScore, newScore, an `edits` array (only the changes you make), and summaryRecommendations. Copy every `match` value EXACTLY from the resume above.",
  ].join("\n");

  return {
    useCase: "match_tailor",
    systemPrompt: TAILOR_JSON_SYSTEM_PROMPT,
    userMessage,
    responseFormat: "json_object",
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

/** List the exact natural keys the model can target, so a retry can fix
 *  edits whose `match` didn't resolve to any entry. */
export function strengthenEditMatchPrompt(
  prompt: TailorPromptOutput,
  resume: ResumeContent,
): TailorPromptOutput {
  const keys = (section: EditSection, names: string[]) =>
    names.length > 0 ? `  ${section}: ${names.map((n) => `"${n}"`).join(", ")}` : null;
  const lines = [
    keys("work", (resume.work ?? []).map((w) => w.name ?? "").filter(Boolean)),
    keys("volunteer", (resume.volunteer ?? []).map((v) => v.organization ?? "").filter(Boolean)),
    keys("projects", (resume.projects ?? []).map((p) => p.name ?? "").filter(Boolean)),
  ].filter(Boolean);

  const block = [
    "",
    "NONE of your edits matched a real entry — the `match` values did not line up with the resume. Use EXACTLY these keys (copy verbatim):",
    ...lines,
  ].join("\n");

  return { ...prompt, userMessage: `${prompt.userMessage}\n${block}` };
}
