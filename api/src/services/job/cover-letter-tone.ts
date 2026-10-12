/**
 * handleCoverLetterTone — POST /api/match/cover-letter/tone: rewrite a cover
 * letter's body in one tone (shared COVER_LETTER_TONES).
 *
 *   • FREE: the one AI letter action that is not Pro. The model call is
 *     `exempt` — no budget gate, and the ledger only audits it
 *     (ai_usage_records, source "free"); the route rate-limits it instead.
 *   • Facts in, facts out: the letter itself is the only source. The model
 *     may reword, reorder within a paragraph, merge or shorten — never add an
 *     employer, number, title, tool or claim the letter doesn't state.
 *   • Only the BODY changes (opening, highlights intro, highlights, closing).
 *     Who it goes to, the greeting, the sign-off, the date and the style are
 *     the person's and are carried over untouched.
 *
 * Persists nothing — the inspector previews the rewrite and the person
 * applies it (one Undo step) or keeps theirs.
 */
import { z } from "zod";
import {
  CoverLetterSchema,
  CoverLetterToneSchema,
  type CoverLetter,
  type CoverLetterTone,
} from "../../../../shared/cover-letter.js";
import { ok, fail, requireAuth, type HandlerResult } from "../../handlers/shared.js";
import { defineLenientIngest, type LLMClient } from "../../services/adapters/llm-client.js";
import { failFromAiError } from "./tailor-handler.js";
import { toHighlights, toParagraphs } from "./cover-letter-handler.js";

export const COVER_LETTER_TONE_FEATURE_KEY = "cover_letter_tone";

export const CoverLetterToneInputSchema = z.object({
  tone: CoverLetterToneSchema,
  letter: CoverLetterSchema,
});
export type CoverLetterToneInput = z.infer<typeof CoverLetterToneInputSchema>;

export interface CoverLetterToneDeps {
  llm: Pick<LLMClient, "callJsonLenient"> | null;
}

/** What the model returns — permissive, like the writer's wire. */
const ToneWireSchema = z.object({
  opening: z.union([z.string(), z.array(z.string())]).optional(),
  highlightsIntro: z.string().optional(),
  highlights: z
    .array(z.union([z.string(), z.object({ label: z.string().optional(), text: z.string().optional() })]))
    .optional(),
  closing: z.union([z.string(), z.array(z.string())]).optional(),
});
export type ToneWire = z.infer<typeof ToneWireSchema>;

const ToneIngest = defineLenientIngest({
  name: "CoverLetterTone",
  ingest: ToneWireSchema,
  coerce: (wire: ToneWire): ToneWire => wire,
});

/** How each tone reads. A new tone = a new entry here + in shared COVER_LETTER_TONES. */
export const TONE_GUIDES: Record<CoverLetterTone, string> = {
  warm: "Warm and human: friendly, sincere, a little personal. Plain words, natural rhythm. Still professional.",
  confident: "Confident and direct: lead with results, active verbs, no hedging (no 'I believe', 'I hope', 'I feel').",
  formal: "Formal and polished: traditional business register, complete sentences, no contractions or casual phrases.",
  brief: "Brief: cut the letter to about half its length. Keep the strongest facts, drop repetition and filler. At most 3 highlights.",
};

export function buildToneSystemPrompt(tone: CoverLetterTone): string {
  return `You rewrite cover letters in a requested tone without changing the facts.

TONE: ${TONE_GUIDES[tone]}

Return JSON exactly matching this shape (no code fences, no commentary):
{
  "opening": ["<paragraph>", "..."],
  "highlightsIntro": "<one sentence, or empty string when the letter has none>",
  "highlights": [{ "label": "<the same label as the input highlight>", "text": "<the rewritten highlight>" }],
  "closing": ["<paragraph>", "..."]
}

RULES:
- Use ONLY facts stated in the letter. Never add an employer, title, number, date, tool, degree, certification, location or achievement that the letter does not state. Keep every number exactly as written.
- Keep the highlights in the same order with the same labels. Only the "brief" tone may drop the weakest highlights.
- Do not write the greeting, the sign-off, the date, the recipient or the candidate's name — they stay as they are.
- Sentences under 25 words. No clichés, no emoji, no markdown.
- Write in the same language as the letter.`;
}

/** The part of the letter the model may rewrite — nothing else is sent. */
export function letterBody(letter: CoverLetter) {
  return {
    jobTitle: letter.jobTitle,
    organization: letter.organization,
    opening: letter.opening,
    highlightsIntro: letter.highlightsIntro,
    highlights: letter.highlights,
    closing: letter.closing,
  };
}

export function buildTonePrompt(input: CoverLetterToneInput) {
  return {
    useCase: "cover_letter" as const,
    systemPrompt: buildToneSystemPrompt(input.tone),
    userMessage: ["LETTER (JSON):", JSON.stringify(letterBody(input.letter), null, 2)].join("\n"),
    responseFormat: "json_object" as const,
  };
}

/**
 * The rewritten letter: the model's body over the original, everything else
 * carried over. Null when the model left no opening (the letter's schema
 * needs one). Highlights the model dropped stay dropped only for "brief";
 * an empty highlights list from another tone keeps the originals. Pure.
 */
export function applyToneRewrite(original: CoverLetter, wire: ToneWire, tone: CoverLetterTone): CoverLetter | null {
  const opening = toParagraphs(wire.opening);
  if (opening.length === 0) return null;
  const rewritten = toHighlights(wire.highlights);
  const highlights = rewritten.length > 0 || tone === "brief" ? rewritten : original.highlights;
  const closing = toParagraphs(wire.closing);
  const parsed = CoverLetterSchema.safeParse({
    ...original,
    opening,
    highlightsIntro: highlights.length ? (wire.highlightsIntro ?? original.highlightsIntro).trim() : "",
    highlights,
    closing: closing.length ? closing : original.closing,
  });
  return parsed.success ? parsed.data : null;
}

export async function handleCoverLetterTone(
  deps: CoverLetterToneDeps,
  viewerId: string | null,
  body: unknown,
): Promise<HandlerResult> {
  const auth = requireAuth(viewerId);
  if ("status" in auth) return auth;

  const parsed = CoverLetterToneInputSchema.safeParse(body);
  if (!parsed.success) return fail(400, "VALIDATION_ERROR", "Invalid request", parsed.error.flatten());
  if (!deps.llm) return fail(503, "AI_UNAVAILABLE", "AI is not configured");

  try {
    const { data } = await deps.llm.callJsonLenient(
      COVER_LETTER_TONE_FEATURE_KEY,
      buildTonePrompt(parsed.data),
      ToneIngest,
      { exempt: true },
    );
    const letter = applyToneRewrite(parsed.data.letter, data, parsed.data.tone);
    if (!letter) return fail(502, "AI_BAD_OUTPUT", "The AI returned an incomplete letter. Please try again.");
    return ok({ letter });
  } catch (err) {
    return failFromAiError(err, err instanceof Error ? err.message : String(err)) ?? fail(502, "AI_ERROR", "Tone rewrite failed");
  }
}
