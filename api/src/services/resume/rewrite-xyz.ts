/**
 * rewrite-xyz.ts — XYZ-format rewrite primitives for resume fields.
 *
 * XYZ = "Accomplished [X] as measured by [Y], by doing [Z]"
 * (Laszlo Bock / Google formulation). The format forces each
 * accomplishment claim to carry an outcome + a metric + a method.
 *
 * Two entry points:
 *   • rewriteHighlightsAsXyz — group rewrite over an entry's bullets.
 *     Same I/O shape as consolidateBullets so the wand's review dialog
 *     renders both flows. Read the bullets together so the model can
 *     reframe them as a coherent narrative (not each in isolation).
 *
 *   • rewriteTextAsXyz — single-string rewrite for summary / position.
 *     Position rewrites stay factual (normalise capitalisation, expand
 *     abbreviations) — XYZ doesn't apply to titles, but the user can
 *     still polish them with the same wand surface.
 *
 * Both are conservative: never invent metrics, never fabricate outcomes,
 * preserve proper nouns + numbers verbatim. On LLM failure the caller
 * decides the fallback (consolidate-highlights echoes; text returns the
 * original) — this module throws so the route can record the error.
 */

import { z } from "zod";
import type { LLMClient } from "../adapters/llm-client.js";
import type { ConsolidateHighlightsItem } from "../../../../shared/tool-schemas.js";

export interface XyzHighlightsContext {
  role?: string;
  organization?: string;
  summary?: string;
}

export interface XyzTextContext {
  role?: string;
  organization?: string;
  highlights?: string[];
}

const HighlightsResponseSchema = z.object({
  items: z.array(
    z.object({
      text: z.string().min(1),
      sources: z.array(z.number().int().min(1)),
    }),
  ),
});

const TextResponseSchema = z.object({
  improved: z.string().min(1),
  notes: z.array(z.string()).optional(),
});

export const XYZ_HIGHLIGHTS_SYSTEM_PROMPT = `You are an expert resume editor. The user gives you the numbered bullet list under ONE resume entry (work / volunteer / project) plus optional context (their role, organization, short summary). Your job: rewrite the bullets into the XYZ accomplishment format and return them as a coherent set.

XYZ FORMAT: each bullet expresses "Accomplished [X], as measured by [Y], by doing [Z]" — the outcome, the metric, and the method. The structure can vary ("Drove [X], cutting [Y] by 40% via [Z]") but every bullet must carry all three signals where the source allows.

Read every input bullet TOGETHER before rewriting. Treat them as one narrative: collapse near-duplicates, merge bullets that describe the same accomplishment, and prefer fewer-but-stronger bullets (typical output 4-8 even when the input has 10+). Each output bullet must carry provenance — set "sources" to the 1-based positions of every input bullet it draws from.

RULES (strict):
- Do NOT invent metrics, dollar amounts, percentages, team sizes, technologies, or accomplishments. If a bullet's source has no measurable Y, write the X/Z and leave the Y implicit — never make up a number.
- Preserve every quantitative fact from the input verbatim (numbers, currencies, percentages, dates, product names, proprietary terms, acronyms).
- Lead with a strong past-tense action verb (Drove, Built, Launched, Reduced, Scaled, Owned, Architected, Shipped, Cut, Delivered). Avoid "Responsible for", "Worked on", "Helped with", "Assisted in".
- Each bullet ≤ 240 characters. Plain text. No leading "-" or "•". No markdown.
- Every input position 1..N must appear in at least one output's "sources" — no orphans. A bullet that survives largely unchanged has a single source.
- Do not invent positions outside 1..N.

Return ONLY a JSON object, no prose, no markdown fence:
{ "items": [ { "text": "<XYZ bullet>", "sources": [<1-based input position>, ...] }, ... ] }`;

export const XYZ_SUMMARY_SYSTEM_PROMPT = `You are an expert resume editor. The user gives you the SHORT role-summary paragraph for ONE entry on their resume, plus optional context (role, organization, and the bullet list under the entry). Rewrite the summary so it foreshadows the XYZ-format accomplishments that follow.

The summary is 1-3 sentences. It should compress the "what + why-it-mattered" of the role: scope of ownership, headline outcome, the bar the candidate raised. It should NOT restate every bullet — it sets up the bullets.

RULES (strict):
- Do NOT invent metrics, dollar amounts, percentages, team sizes, technologies, or outcomes. Pull facts ONLY from the input summary or the supplied highlights.
- Keep proper nouns, product names, acronyms, and numbers verbatim.
- Lead with a noun phrase about scope ("Engineering lead for ...", "Owner of ...") followed by a strong outcome verb. Avoid "Responsible for".
- 1-3 sentences. ≤ 400 characters total. Plain text. No markdown.
- If the input is already strong, return it largely unchanged.

Return ONLY a JSON object: { "improved": "<rewritten summary>", "notes": ["optional short rationale"] }`;

export const XYZ_POSITION_SYSTEM_PROMPT = `You are a resume editor. The user gives you a job title from their resume. Polish it to be ATS-friendly and recognisable — expand abbreviations, normalise capitalisation, drop noise.

CRITICAL: a job title is a factual claim about what the candidate's employer called them. Do NOT promote them ("Engineer" → "Senior Engineer" is FORBIDDEN). Do NOT change the seniority signal. Do NOT translate domains ("Engineer" → "Developer" requires the candidate's word).

You MAY:
- Expand abbreviations the reader might not know (e.g. "Eng II" → "Software Engineer II", "Sr. PM" → "Senior Product Manager"). Only when the expansion is unambiguous from context.
- Normalise capitalisation (Title Case for the role name).
- Trim trailing department/team noise that belongs in the organization field.

If the title is already clean and unambiguous, return it UNCHANGED.

Return ONLY a JSON object: { "improved": "<polished title>", "notes": ["optional short rationale"] }`;

/**
 * Rewrite an entry's bullet list into XYZ format as a coherent set.
 * Returns the same `{ items: [{ text, sources }] }` shape as
 * consolidate-highlights so the same review dialog can render either.
 * Caller is responsible for the no-LLM and LLM-error fallbacks
 * (typically: echo the input 1:1).
 */
export async function rewriteHighlightsAsXyz(
  highlights: string[],
  context: XyzHighlightsContext | undefined,
  llm: LLMClient,
  featureKey = "resume_rewrite_xyz_highlights",
): Promise<{ items: ConsolidateHighlightsItem[] }> {
  if (!Array.isArray(highlights) || highlights.length === 0) {
    return { items: [] };
  }

  const contextLines: string[] = [];
  if (context?.role) contextLines.push(`Role: ${context.role}`);
  if (context?.organization) contextLines.push(`Organization: ${context.organization}`);
  if (context?.summary) contextLines.push(`Summary: ${context.summary}`);
  const contextBlock = contextLines.length > 0 ? `${contextLines.join("\n")}\n\n` : "";

  const userMessage = `${contextBlock}Current bullets:\n${highlights
    .map((h, i) => `${i + 1}. ${h}`)
    .join("\n")}\n\nRewrite as XYZ-format bullets. Return JSON.`;

  const { data } = await llm.callJson(
    featureKey,
    {
      useCase: "resume_consolidate_highlights",
      systemPrompt: XYZ_HIGHLIGHTS_SYSTEM_PROMPT,
      userMessage,
      responseFormat: "json_object",
    },
    HighlightsResponseSchema,
  );

  const items = Array.isArray(data.items) ? data.items : [];
  if (items.length === 0) {
    return { items: highlights.map((h, i) => ({ text: h, sources: [i + 1] })) };
  }
  return { items };
}

/**
 * Rewrite a single text field (summary or position) using the XYZ
 * editorial lens. Position rewrites stay factual (no seniority drift);
 * summary rewrites reframe scope+outcome to foreshadow XYZ bullets.
 */
/**
 * #989 — Normalize + dedupe a skills list for ATS clarity. NOT XYZ
 * format (skills aren't accomplishments). Output is a clean, deduped
 * list of canonical skill names with optional merge notes the UI can
 * show in the review dialog ("merged 'aws' + 'AWS' + 'Aws' → AWS").
 */
const SKILLS_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          sources: { type: "array", items: { type: "number" } },
          note: { type: "string" },
        },
        required: ["text", "sources"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

const REWRITE_SKILLS_SYSTEM_PROMPT = `You are an expert resume editor. The user gives you a numbered list of skills from one section of their resume. Your job: normalise casing ("aws" → "AWS", "javascript" → "JavaScript"), expand ambiguous abbreviations the first time they appear ("ML" → "Machine Learning"), and dedupe near-synonyms by merging them under one canonical name.

Rules:
- Return a coherent ATS-friendly skill list.
- Preserve domain-correct casing (Kubernetes, PostgreSQL, GraphQL, TypeScript).
- Merge "JS" + "JavaScript" → "JavaScript". Merge "React.js" + "ReactJS" + "React" → "React".
- Do NOT add new skills the user didn't list.
- Do NOT translate or rephrase actual skill names; only normalise casing + expand abbreviations.
- Output STRICT JSON only:
  { "items": [ { "text": "<canonical skill>", "sources": [<index numbers from input>], "note": "<optional human-readable merge note>" } ] }
- Indexes in \`sources\` are 1-based from the numbered input list.`;

export async function rewriteSkillsAsAts(
  skills: string[],
  llm: LLMClient,
  featureKey = "resume_rewrite_skills_ats",
): Promise<{ items: Array<ConsolidateHighlightsItem & { note?: string }> }> {
  if (!Array.isArray(skills) || skills.length === 0) {
    return { items: [] };
  }

  const userMessage = `Current skills:\n${skills.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nNormalise + dedupe. Return JSON.`;

  try {
    const { data } = await llm.callJson(
      featureKey,
      {
        useCase: "resume_consolidate_highlights",
        systemPrompt: REWRITE_SKILLS_SYSTEM_PROMPT,
        userMessage,
        responseFormat: "json_object",
      },
      SKILLS_RESPONSE_SCHEMA as any,
    );
    const items = Array.isArray((data as any).items) ? (data as any).items : [];
    if (items.length === 0) {
      return { items: skills.map((s, i) => ({ text: s, sources: [i + 1] })) };
    }
    return { items };
  } catch {
    // LLM unavailable / errored — echo input 1:1 so the caller has a
    // safe fallback.
    return { items: skills.map((s, i) => ({ text: s, sources: [i + 1] })) };
  }
}

export async function rewriteTextAsXyz(
  kind: "summary" | "position",
  original: string,
  context: XyzTextContext | undefined,
  llm: LLMClient,
  featureKey = "resume_rewrite_xyz_text",
): Promise<{ improved: string; notes?: string[] }> {
  if (!original || original.trim().length === 0) {
    return { improved: original };
  }

  const systemPrompt =
    kind === "summary" ? XYZ_SUMMARY_SYSTEM_PROMPT : XYZ_POSITION_SYSTEM_PROMPT;

  const contextLines: string[] = [];
  if (context?.role) contextLines.push(`Role: ${context.role}`);
  if (context?.organization) contextLines.push(`Organization: ${context.organization}`);
  if (context?.highlights && context.highlights.length > 0) {
    contextLines.push(
      `Highlights under this entry:\n${context.highlights
        .map((h, i) => `  ${i + 1}. ${h}`)
        .join("\n")}`,
    );
  }
  const contextBlock = contextLines.length > 0 ? `${contextLines.join("\n")}\n\n` : "";

  const fieldLabel = kind === "summary" ? "Role summary" : "Job title";
  const userMessage = `${contextBlock}${fieldLabel}: ${original}\n\nReturn the polished version as JSON.`;

  const { data } = await llm.callJson(
    featureKey,
    {
      useCase: "resume_consolidate_highlights",
      systemPrompt,
      userMessage,
      responseFormat: "json_object",
    },
    TextResponseSchema,
  );

  return { improved: data.improved, notes: data.notes };
}
