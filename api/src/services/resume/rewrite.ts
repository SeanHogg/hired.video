/**
 * resume-ai-rewrite.ts — AI-powered consolidation/rewriting for resume
 * bullet-style fields (highlights, courses, keywords, roles).
 *
 * Used after a merge to clean up accumulated duplicates and slight
 * wording variants that the heuristic dedup in `mergeHighlights` can't
 * catch (e.g. "Led team of 10" vs. "Led a team of 10 engineers").
 *
 * The prompt is deliberately conservative: it never invents quantitative
 * claims, keeps the original voice, and only combines items that
 * describe the same underlying accomplishment.
 */

import { z } from "zod";
import { callLLMJson } from "../adapters/ai.js";

export type BulletFieldType = "highlights" | "keywords" | "courses" | "roles";

export interface ConsolidateBulletsContext {
  /** Which field we're consolidating — shapes the prompt. */
  fieldType: BulletFieldType;
  /** The section this entry lives in (work, volunteer, projects, education, ...). */
  sectionType: string;
  /** Human-readable label for the entry the bullets belong to, e.g.
   *  "VP of Technology at Acme" or "B.Sc. Computer Science at MIT".
   *  Helps the model keep rewrites relevant to the role. */
  entryLabel?: string;
}

export interface ConsolidateResult {
  rewritten: string[];
  /** Optional — per-input trace of which originals were combined into
   *  which rewritten item. Present when the model returns it; empty
   *  otherwise. */
  notes?: string[];
}

const ConsolidateResponseSchema = z.object({
  rewritten: z.array(z.string()),
  notes: z.array(z.string()).optional(),
});

/** Rules baked into the system prompt — kept as a shared constant so
 *  callers (and tests) can inspect them. */
const RULES_BY_FIELD: Record<BulletFieldType, string[]> = {
  highlights: [
    "Each item is an accomplishment/responsibility bullet. Keep first-person-implicit (no 'I') past-tense voice for past roles; present tense for current roles.",
    "Deduplicate semantic duplicates — two bullets describing the same accomplishment with slight wording differences should collapse to ONE item.",
    "Merge related items only when they clearly describe ONE accomplishment. Do NOT invent connections between unrelated bullets.",
    "Preserve every quantified fact (percentages, dollar amounts, team sizes, dates, product counts). Never fabricate numbers.",
    "Tighten language: drop filler, prefer strong verbs, keep bullets under ~200 characters.",
    "Preserve the user's tech/product terminology exactly (product names, proprietary terms, acronyms).",
  ],
  keywords: [
    "Each item is a skill or keyword. Normalise casing (e.g. 'javascript' -> 'JavaScript', 'aws' -> 'AWS', 'React.js' kept).",
    "Deduplicate: 'JS' and 'JavaScript' are the same; keep the more specific/common form.",
    "Merge synonyms only when they refer to the exact same technology (e.g. 'K8s' + 'Kubernetes' -> 'Kubernetes').",
    "Do NOT add keywords that weren't in the input, even if they seem implied.",
    "Preserve proper nouns (framework names, vendor products) as-is.",
  ],
  courses: [
    "Each item is a course name. Deduplicate by meaning (e.g. 'Intro to CS' and 'Introduction to Computer Science' are the same).",
    "Keep the fuller/more formal title when deduping.",
    "Do NOT invent course titles.",
  ],
  roles: [
    "Each item is a role title held on a project.",
    "Deduplicate synonyms (e.g. 'Tech Lead' and 'Technical Lead').",
    "Preserve the original capitalisation/titling where possible.",
  ],
};

/** Build the system prompt. Exported for tests/telemetry. */
export function buildSystemPrompt(ctx: ConsolidateBulletsContext): string {
  const rules = RULES_BY_FIELD[ctx.fieldType] ?? RULES_BY_FIELD.highlights;
  return [
    `You are a resume editor. Your job is to consolidate and clean up a list of ${ctx.fieldType} from the "${ctx.sectionType}" section of a resume${ctx.entryLabel ? ` (entry: "${ctx.entryLabel}")` : ""}.`,
    "",
    "RULES:",
    ...rules.map((r, i) => `  ${i + 1}. ${r}`),
    "",
    "OUTPUT — return ONLY a JSON object with this exact shape (no markdown fences, no prose):",
    `{`,
    `  "rewritten": ["...", "..."],`,
    `  "notes": ["optional: short rationale for non-obvious merges"]`,
    `}`,
    "",
    "The `rewritten` array is the cleaned list in the order they should appear on the resume. If the input was already clean, return it largely unchanged.",
  ].join("\n");
}

/**
 * Consolidate a list of bullet-style items using the LLM. Returns the
 * rewritten list. Caller is responsible for falling back to the original
 * list when this throws (e.g. no API key available, AI failure).
 */
export async function consolidateBullets(
  bullets: string[],
  context: ConsolidateBulletsContext,
  apiKey: string,
): Promise<ConsolidateResult> {
  if (!Array.isArray(bullets) || bullets.length === 0) {
    return { rewritten: [] };
  }

  // Short-circuit: nothing to consolidate
  if (bullets.length === 1) {
    return { rewritten: [...bullets] };
  }

  const systemPrompt = buildSystemPrompt(context);
  const userMessage = JSON.stringify({ bullets });

  const result = await callLLMJson(
    apiKey,
    {
      systemPrompt,
      userMessage,
      temperature: 0.2, // low temp — editing, not creative writing
      responseFormat: "json_object",
    },
    ConsolidateResponseSchema,
  );

  // Safety net: if the model returned an empty list, fall back to the
  // input so we never silently destroy the user's data.
  const rewritten = Array.isArray(result.rewritten) && result.rewritten.length > 0
    ? result.rewritten
    : [...bullets];

  return { rewritten, notes: result.notes };
}
