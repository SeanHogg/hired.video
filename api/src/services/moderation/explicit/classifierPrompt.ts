/**
 * The ONE explicit-scan classifier contract shared by every model adapter
 * (text via the gateway / Workers AI, images via gateway vision / Workers AI
 * vision): the policy prompt and the tolerant parser of the model's JSON.
 */
import { z } from "zod";
import {
  EXPLICIT_CATEGORIES,
  normalizeCategories,
  type ExplicitVerdict,
} from "../../../../../shared/moderation/explicit.js";

const POLICY = `The platform is a professional job-search site. Its home page shows
people's video résumés to everyone, so it must stay safe for work.

Block anything containing:
  - sexual: sexual content, nudity, lingerie/underwear posing, sexual acts or innuendo
  - weapons: guns, rifles, knives used as weapons, explosives, ammunition
  - violence: gore, blood, injuries, fighting, killing, graphic violence
  - profanity: swearing or obscene words / gestures (including masked like f*ck)
  - hate: slurs, hate symbols, extremist content, harassment of a group
  - drugs: illegal drugs, drug use or paraphernalia

Ordinary career content passes: "photo shoot", "shooting for goals",
"killing it in the interview", "bullet points", tools like a nail gun in a
trade, kitchen knives in a chef's work, medical terms, legal discussion of
workplace harassment policies.`;

const CATEGORY_LIST = EXPLICIT_CATEGORIES.join(" | ");

export const TEXT_SYSTEM_PROMPT = `You are a strict content-safety classifier.
${POLICY}

You will receive text written by a user. Return ONLY JSON:
{"verdict": "pass" | "block", "categories": [${CATEGORY_LIST}], "reason": "<one short sentence>"}`;

export const IMAGE_SYSTEM_PROMPT = `You are a strict image content-safety classifier.
${POLICY}

You will receive one or more images (photos or frames of a video). If ANY image
contains blocked content, the verdict is block. Return ONLY JSON:
{"verdict": "pass" | "block", "categories": [${CATEGORY_LIST}], "reason": "<one short sentence>"}`;

const VerdictSchema = z.object({
  verdict: z.enum(["pass", "block"]),
  categories: z.array(z.string()).default([]),
  reason: z.string().max(600).nullable().optional(),
});

/** Pull the first JSON object out of a model answer (models sometimes wrap
 *  it in prose or code fences). */
function firstJsonObject(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("classifier returned no JSON");
  return JSON.parse(raw.slice(start, end + 1));
}

/**
 * Parse a classifier answer into a verdict. Throws on anything malformed —
 * callers map a throw to `unscreened` (never to pass). A block with no
 * recognisable category still blocks.
 */
export function parseClassifierVerdict(raw: string): ExplicitVerdict {
  const data = VerdictSchema.parse(firstJsonObject(raw));
  if (data.verdict === "pass") return { verdict: "pass", categories: [], reason: null };
  return {
    verdict: "block",
    categories: normalizeCategories(data.categories.map((c) => c.toLowerCase().trim())),
    reason: data.reason?.trim() || "classifier flagged explicit content",
  };
}
