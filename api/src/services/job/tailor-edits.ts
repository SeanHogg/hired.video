/**
 * Tailor — the pure half of the pipeline: the model's compact EDIT
 * contract, the prompt, applying edits to a résumé (with a content-path
 * anchor per change, so Revert is exact), and validation. No I/O.
 *
 * Shared by POST /api/match/tailor (tailor-handler.ts) and create-from-a-
 * job (services/resume/from-job.ts), which applies the same edit op-set.
 * Extracted from match-handlers.ts (which kept the scoring flows).
 */
import { z } from "zod";
import { defineLenientIngest } from "../../services/adapters/llm-client.js";
import { coerceEnum } from "../../services/adapters/lenient-coerce.js";
import type { ParsedJob } from "../../services/job/JobService.js";
import { ResumeContentSchema, type ResumeContent } from "../../../../shared/resume.js";
import { joinPath } from "../../../../shared/resume-path.js";
import {
  TailorChangeSchema,
  entryNaturalKey,
  type JobGap,
  type TailorChange,
} from "../../../../shared/resume-tailor.js";
export { TailorChangeSchema, type TailorChange };

/** LLMs sometimes return recommendations as string[] instead of string. */
export const coerceToString = z
  .union([
    z.string(),
    z.array(z.string()).transform((arr) => arr.map((s) => `- ${s}`).join("\n")),
  ])
  .pipe(z.string());


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


// ─── Tailor edit contract (gap #2109 — diff-only output) ───────────────────
//
// The model NO LONGER echoes the whole tailored resume. It returns a small
// set of structured EDITS; the server applies them to the source document
// (see `applyResumeEdits`) and re-derives the full `tailoredResume` + the
// human-readable `changes[]` trail. Two wins over the old full-echo schema:
//   • the request's strict `responseSchema` shrinks from the entire
//     `ResumeContentSchema` (~163 decoding states — which Gemini rejected
//     with `400 too many states`, gap #1801) to a handful of fields, so
//     strict-mode vendor conformance works again;
//   • completion tokens roughly halve — the model writes only what changed,
//     not a verbatim copy of every untouched section.
//
// The op-set is deliberately ADDITIVE: there is no "remove entry" operation,
// so no work/education entry can ever be dropped — the preservation guarantee
// the JSON pipeline exists to enforce now holds by construction.
//
// Flat (non-discriminated) shape on purpose: free-tier models fudge the
// `op`/`section` strings, so we keep the wire schema permissive and let
// `applyResumeEdits` interpret + coerce defensively (unmatched / unknown
// edits are skipped, never fatal).
export const TailorEditSchemaWire = z.object({
  /** basics | highlights | summary | skills (normalised in applyResumeEdits). */
  op: z.string().min(1),
  /** For highlights/summary: which list to target — work | volunteer | projects. */
  section: z.string().optional(),
  /** Natural key of the target entry — work[].name / volunteer[].organization
   *  / projects[].name, copied verbatim from the input so the server can
   *  locate it. */
  match: z.string().optional(),
  /** basics headline. */
  label: z.string().optional(),
  /** basics professional summary, OR a work/volunteer/project entry summary. */
  summary: z.string().optional(),
  /** Full replacement highlight list for the matched entry. */
  highlights: z.array(z.string()).optional(),
  /** Full replacement skills section. */
  skills: z
    .array(
      z.object({
        name: z.string(),
        level: z.string().optional(),
        keywords: z.array(z.string()).default([]),
      }),
    )
    .optional(),
  /** One-sentence justification, surfaced in the derived changes[] trail. */
  why: z.string().optional(),
});
export type TailorEdit = z.infer<typeof TailorEditSchemaWire>;

/** What the job asks for that the résumé has no evidence of. Permissive on
 *  the wire (free models fudge `kind`); `toJobGaps` normalises it. */
export const TailorGapWireSchema = z.object({
  requirement: z.string(),
  kind: z.string().optional(),
  question: z.string().optional(),
  skill: z.string().optional(),
  /** Natural key of the entry the answer most likely belongs to. */
  match: z.string().optional(),
  section: z.string().optional(),
});
export type TailorGapWire = z.infer<typeof TailorGapWireSchema>;

export const TailorEditResponseSchema = z.object({
  oldScore: z.number().min(0).max(100),
  newScore: z.number().min(0).max(100),
  edits: z.array(TailorEditSchemaWire).default([]),
  gaps: z.array(TailorGapWireSchema).default([]),
  /** The job's keywords the résumé already shows (#2344) — verified against
   *  the résumé server-side (matched-keywords.ts) before anyone sees them. */
  matchedKeywords: z.array(z.string()).default([]),
  summaryRecommendations: coerceToString,
});
export type TailorEditResponse = z.infer<typeof TailorEditResponseSchema>;

/** Lenient ingest for the tailor edits. The wire schema is already
 *  permissive (string `op`/`section`, every field optional), so the coerce
 *  step is the identity — all interpretation/normalisation lives in
 *  `applyResumeEdits` where it can be unit-tested in isolation. */
export const TailorEditResponseIngest = defineLenientIngest({
  name: "MatchTailorEdits",
  ingest: TailorEditResponseSchema,
  coerce: (wire): TailorEditResponse => wire,
});


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

// ---------------------------------------------------------------------------
// applyResumeEdits — turn the model's compact edit list into the full
// tailored document + the human-readable changes[] trail. Gap #2109.
// ---------------------------------------------------------------------------

/** Top-level sections whose entries carry editable highlights/summary. */
const EDIT_SECTION_ALLOWED = ["work", "volunteer", "projects"] as const;
type EditSection = (typeof EDIT_SECTION_ALLOWED)[number];

const EDIT_SECTION_ALIASES: Record<string, EditSection> = {
  experience: "work", employment: "work", positions: "work", roles: "work", job: "work", jobs: "work",
  project: "projects",
  volunteering: "volunteer", volunteer_work: "volunteer",
};

/** Normalise the free-form `op` a model returns onto the canonical op set.
 *  Returns null for anything unrecognised so `applyResumeEdits` can skip it. */
function normalizeEditOp(op: string): "basics" | "highlights" | "summary" | "skills" | null {
  const o = op.trim().toLowerCase();
  if (["basics", "header", "profile", "contact", "headline"].includes(o)) return "basics";
  if (["highlights", "highlight", "bullet", "bullets", "bulletpoints"].includes(o)) return "highlights";
  if (["summary", "description", "blurb"].includes(o)) return "summary";
  if (["skills", "skill", "skillset"].includes(o)) return "skills";
  return null;
}

/**
 * Apply the model's structured edits to a deep clone of the source resume,
 * producing the tailored document AND the `changes[]` trail (`before` is the
 * AUTHORITATIVE original value read from the source, not a model claim).
 *
 * The op-set is deliberately additive — there is NO "remove entry"
 * operation, so no work/education entry can ever be dropped (the guarantee
 * the JSON pipeline exists to enforce now holds by construction). Unmatched
 * / unknown / no-op edits are skipped, never fatal.
 *
 * Pure — no I/O, no mutation of `source`. Exported for unit tests.
 */
export function applyResumeEdits(
  source: ResumeContent,
  edits: TailorEdit[],
): { content: ResumeContent; changes: TailorChange[] } {
  // Deep clone via JSON round-trip — ResumeContent is pure JSON, and this
  // guarantees we never alias the caller's source object.
  const content = JSON.parse(JSON.stringify(source)) as ResumeContent;
  const changes: TailorChange[] = [];
  const norm = (s: string) => s.trim().toLowerCase();

  for (const edit of edits) {
    const op = normalizeEditOp(edit.op);
    if (!op) continue;
    const why = (edit.why ?? "").trim();

    if (op === "basics") {
      const b = (content.basics ?? {}) as Record<string, unknown>;
      if (typeof edit.label === "string" && edit.label !== (b.label ?? "")) {
        changes.push({ section: "basics", path: "basics.label", before: String(b.label ?? ""), after: edit.label, why });
        b.label = edit.label;
      }
      if (typeof edit.summary === "string" && edit.summary !== (b.summary ?? "")) {
        changes.push({ section: "basics", path: "basics.summary", before: String(b.summary ?? ""), after: edit.summary, why });
        b.summary = edit.summary;
      }
      content.basics = b as ResumeContent["basics"];
      continue;
    }

    if (op === "skills") {
      if (Array.isArray(edit.skills)) {
        const before = (content.skills ?? []).map((s) => s.name).filter(Boolean).join(", ");
        const after = edit.skills.map((s) => s.name).filter(Boolean).join(", ");
        content.skills = edit.skills.map((s) => ({
          name: s.name,
          level: s.level ?? "",
          keywords: s.keywords ?? [],
        })) as ResumeContent["skills"];
        changes.push({ section: "skills", path: "skills", before, after, why });
      }
      continue;
    }

    // highlights | summary — locate one entry by its natural key.
    const section = coerceEnum(edit.section ?? "", {
      allowed: EDIT_SECTION_ALLOWED,
      aliases: EDIT_SECTION_ALIASES,
      fallback: "work",
    });
    const arr = content[section] as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(arr) || arr.length === 0) continue;
    const matchKey = norm(edit.match ?? "");
    if (!matchKey) continue;
    const index = arr.findIndex((e) => norm(entryNaturalKey(section, e)) === matchKey);
    if (index < 0) continue; // unmatched → skip (never creates/removes entries)
    const target = arr[index];

    if (op === "highlights" && Array.isArray(edit.highlights)) {
      const before = (Array.isArray(target.highlights) ? (target.highlights as string[]) : []).join("\n");
      const after = edit.highlights.join("\n");
      if (before !== after) {
        target.highlights = edit.highlights;
        changes.push({ section, path: joinPath(section, index, "highlights"), before, after, why });
      }
    } else if (op === "summary" && typeof edit.summary === "string") {
      if (String(target.summary ?? "") !== edit.summary) {
        changes.push({ section, path: joinPath(section, index, "summary"), before: String(target.summary ?? ""), after: edit.summary, why });
        target.summary = edit.summary;
      }
    }
  }

  return { content, changes };
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


/**
 * Normalise the model's `gaps` into the wire `JobGap` shape: ids `G1…`,
 * `kind` coerced (a gap that names a skill and no entry is a skill
 * question), `anchorPath` resolved from the entry's natural key. Gaps the
 * résumé already covers by name (a listed skill) are dropped — the model is
 * not trusted to know that.
 */
export function toJobGaps(wire: readonly TailorGapWire[], content: ResumeContent): JobGap[] {
  const norm = (s: string) => s.trim().toLowerCase();
  const listed = new Set(
    (content.skills ?? []).flatMap((s) => [s.name ?? "", ...(s.keywords ?? [])]).map(norm).filter(Boolean),
  );
  const gaps: JobGap[] = [];
  for (const g of wire) {
    const requirement = g.requirement.trim();
    if (!requirement) continue;
    const skill = g.skill?.trim();
    if (skill && listed.has(norm(skill))) continue;
    const kind = coerceEnum(g.kind ?? "", {
      allowed: ["skill", "experience"] as const,
      aliases: { tool: "skill", technology: "skill", keyword: "skill", domain: "experience", achievement: "experience" },
      fallback: skill && !g.match ? "skill" : "experience",
    });
    let anchorPath: string | undefined;
    if (g.match) {
      const section = coerceEnum(g.section ?? "", { allowed: EDIT_SECTION_ALLOWED, aliases: EDIT_SECTION_ALIASES, fallback: "work" });
      const index = ((content[section] ?? []) as Array<Record<string, unknown>>).findIndex(
        (e) => norm(entryNaturalKey(section, e)) === norm(g.match ?? ""),
      );
      if (index >= 0) anchorPath = joinPath(section, index);
    }
    gaps.push({
      id: `G${gaps.length + 1}`,
      requirement,
      kind,
      question: g.question?.trim() || requirement,
      ...(kind === "skill" ? { skill: skill || requirement } : {}),
      ...(anchorPath ? { anchorPath } : {}),
    });
    if (gaps.length >= 5) break;
  }
  return gaps;
}

/**
 * Honesty guard on a skills edit: a skill the model put in the draft that
 * the source résumé never mentions (every word of it, anywhere) is removed.
 * Rephrasing ("CI/CD" for "continuous integration") is the model's job;
 * claiming a tool the person never wrote down is not.
 *
 * A skill WITH keywords is a group ("Cybersecurity & Risk": [...]) — its
 * name is a heading the model may phrase in the job's words, so the
 * keywords are what get checked, one by one, and the group stays while at
 * least one survives. A skill without keywords is a claim itself: its name
 * is checked.
 */
export function dropUnsupportedSkills(source: ResumeContent, tailored: ResumeContent): ResumeContent {
  if (tailored.skills === source.skills) return tailored;
  const corpus = JSON.stringify(source).toLowerCase();
  const supported = (name: string) =>
    name
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/)
      .filter((w) => w.length > 2)
      .every((w) => corpus.includes(w));
  let changed = false;
  const skills = (tailored.skills ?? []).flatMap((s) => {
    const keywords = s.keywords ?? [];
    if (keywords.length === 0) {
      if (supported(s.name ?? "")) return [s];
      changed = true;
      return [];
    }
    const kept = keywords.filter(supported);
    if (kept.length === keywords.length) return [s];
    changed = true;
    return kept.length ? [{ ...s, keywords: kept }] : [];
  });
  return changed ? { ...tailored, skills } : tailored;
}
