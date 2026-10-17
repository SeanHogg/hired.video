/**
 * Prompt safety guard — the single chokepoint every generation request
 * passes through before any model (text LLM or image diffusion) fires.
 *
 * Why this exists: the AI career-coach chat refuses harmful prompts
 * (the model's own safety layer), but the studio image / video / comic
 * generators call Cloudflare Workers AI and the Builderforce LLM gateway
 * directly with no pre-screen — so "people shooting guns at each other"
 * was refused in chat yet still rendered an image. This module closes
 * that gap with a deterministic, no-network screen (regex + word lists)
 * so a block does NOT depend on a model round-trip and cannot be skipped
 * by whichever transport a feature happens to use.
 *
 * Two wiring points consume it (DRY — one rule set, two call sites):
 *   1. `LLMClient.dispatch` screens the user-role message of EVERY text
 *      LLM call (career coach, storyboard script, comic scaffolder, …)
 *      unless the caller sets `skipContentGuard` (the moderation scanner
 *      legitimately passes flagged text and must opt out).
 *   2. The studio image / inpaint / outpaint / comic / storyboard routes
 *      screen the user's free-form prompt BEFORE doing any work, so the
 *      block is authoritative even for the Workers-AI image path that
 *      never touches LLMClient, and even for routes that catch LLM
 *      errors and fall back to a mock (storyboard).
 *
 * Design notes:
 *   • Conservative by construction. Patterns require a violent VERB in
 *     proximity to a PERSON target ("shoot … each other", "kill people")
 *     rather than bare nouns, so benign hiring-domain language survives:
 *     "shoot a video", "photo shoot", "nail gun", "kill it in the
 *     interview", "execute the strategy", "bullet points" do NOT match.
 *   • First match wins; any match blocks. `severity` is retained for
 *     telemetry, not for a soft-pass tier — a generation guard either
 *     allows or blocks.
 *   • The matched fragment is returned for SERVER logs only. The
 *     user-facing message names the category, never echoes their text.
 */

import { AppError } from "../../middleware/errorHandler.js";
import { HARMFUL_SLURS, lexiconTermsIn } from "../../../../shared/moderation/explicit-lexicon.js";
import { logger } from "../../lib/logger.js";

export type HarmCategory =
  | "violence"
  | "weapons"
  | "csam"
  | "sexual_violence"
  | "self_harm"
  | "terrorism"
  | "hate_slur";

export interface PromptScreenResult {
  /** False when the prompt matched a harmful pattern. */
  safe: boolean;
  category?: HarmCategory;
  /** Human-readable rule label for server logs / SA review. */
  label?: string;
  /** The substring that triggered the block. SERVER-side only — never
   *  echo to the client (use {@link userBlockMessage} for that). */
  matched?: string;
}

/**
 * Canonical identity-slur list — owned by the shared explicit lexicon
 * (shared/moderation/explicit-lexicon.ts) so this guard, the article
 * content scanner and the explicit scan all use the SAME list. Matched here
 * as whole words only.
 */
export { HARMFUL_SLURS };

interface GuardRule {
  category: HarmCategory;
  label: string;
  pattern: RegExp;
}

// Person / victim targets that turn an otherwise-ambiguous violent verb
// into a depiction of violence against people. Deliberately EXCLUDES bare
// pronouns (him / her / them / us / me) — they collide with business
// hyperbole ("kill it", "execute her plan") far more than they catch real
// harm. Person NOUNS + "each other" carry the signal with far fewer false
// positives. Reused across rules.
const TARGET = String.raw`(?:people|persons?|each ?other|one another|crowds?|kids?|children|child|students?|civilians?|humans?|victims?|hostages?|prisoners?|babies|infants?|toddlers?)`;

// Firearm / weapon nouns. "shoot" / "fire" / "aim" only read as violence
// when one of these sits nearby — so "shoot a video", "photo shoot",
// "fire up the team", "fired 200 people" all stay safe.
const FIREARM = String.raw`(?:gun|guns|gunman|gunmen|rifle|rifles|pistol|pistols|firearm|firearms|weapon|weapons|bullet|bullets|shotgun|handgun|machine ?gun|ak-?47|ar-?15|assault rifle)`;

// Up to ~20 chars of filler between tokens so "shooting guns at each
// other" still trips the rule without spanning a whole sentence.
const NEAR = String.raw`[\s\w'",-]{0,20}`;

const RULES: GuardRule[] = [
  // ─── CSAM — highest priority, screened first ──────────────────────
  {
    category: "csam",
    label: "child sexual abuse material",
    pattern:
      /\b(?:child|children|kid|kids|minor|minors|underage|under-age|pre-?teen|preteen|toddler|infant|baby|7yo|8yo|9yo|10yo|11yo|12yo|loli|shota|jailbait)\b[\s\w'",-]{0,24}\b(?:nude|naked|sex|sexual|sexually|porn|pornographic|nsfw|explicit|aroused|erotic|genital|genitals|breasts?|undress(?:ed|ing)?|fondl)/i,
  },
  {
    category: "csam",
    label: "child sexual abuse material",
    pattern:
      /\b(?:nude|naked|sexual|sexually|porn|explicit|erotic|fondl\w*|undress\w*)\b[\s\w'",-]{0,24}\b(?:child|children|kid|kids|minor|minors|underage|pre-?teen|preteen|toddler|infant)\b/i,
  },
  {
    category: "csam",
    label: "child sexual abuse material",
    pattern: /\b(?:child ?porn|cp ?porn|csam|loli(?:con)?|shota(?:con)?|jailbait)\b/i,
  },

  // ─── Sexual violence ──────────────────────────────────────────────
  {
    category: "sexual_violence",
    label: "sexual violence / non-consensual",
    pattern: /\b(?:rape|raping|rapist|molest\w*|non-?consensual|forced sex|sexual assault)\b/i,
  },

  // ─── Firearm violence ─────────────────────────────────────────────
  // "shoot / fire / aim / spray" only count WITH a firearm word nearby,
  // which is the disambiguator that lets "shoot a video", "photo shoot",
  // and "fire up the team" through. Covers the reported regression
  // ("people shooting guns at each other").
  {
    category: "violence",
    label: "firearm violence",
    pattern: new RegExp(
      String.raw`\b(?:shoot\w*|fir(?:e|ing|ed)|aim(?:ing|ed|s)?|spray\w*|blast\w*|unload\w*)\b` +
        NEAR +
        String.raw`\b${FIREARM}\b`,
      "i",
    ),
  },
  {
    category: "violence",
    label: "firearm violence",
    // firearm noun → "at / into / on" → person target ("guns at each
    // other", "a rifle pointed at the crowd").
    pattern: new RegExp(
      String.raw`\b${FIREARM}\b` +
        String.raw`[\s\w'",-]{0,12}\b(?:at|into|on|toward)\b[\s\w'",-]{0,12}\b${TARGET}\b`,
      "i",
    ),
  },
  {
    category: "violence",
    label: "mass / targeted shooting",
    pattern: /\b(?:mass|school|church|mosque|synagogue|crowd) ?shoot(?:ing|er)\b|\bshoot(?:ing)? up (?:a |the )?(?:school|church|mall|crowd|building|place)\b|\bdrive-?by shooting\b/i,
  },

  // ─── Other graphic violence against people ────────────────────────
  // Verbs here are NOT overloaded with benign business usage, so a person
  // target in proximity is a reliable signal. ("kill" / "murder" ARE
  // overloaded — handled by the tight rule below.)
  {
    category: "violence",
    label: "graphic violence against people",
    pattern: new RegExp(
      String.raw`\b(?:stab(?:bing|bed)|behead\w*|decapitat\w*|dismember\w*|slaughter(?:ing|ed|s)?|massacr\w*|lynch\w*|strangl(?:e|ing|ed)|tortur(?:e|ing|ed)|mutilat\w*|gun(?:ning|ned) down)\b` +
        NEAR +
        String.raw`\b${TARGET}\b`,
      "i",
    ),
  },
  {
    category: "violence",
    label: "graphic violence against people",
    // person target → passive violent verb ("civilians being massacred").
    pattern: new RegExp(
      String.raw`\b${TARGET}\b` +
        NEAR +
        String.raw`\b(?:murdered|stabbed|beheaded|decapitated|dismembered|slaughtered|massacred|lynched|strangled|mutilated|gunned down)\b`,
      "i",
    ),
  },
  {
    category: "violence",
    label: "killing people",
    // "kill" / "murder" are heavily overloaded ("killing it", "kill the
    // deal", "killer results"). Require the verb to DIRECTLY govern a
    // person noun (optional determiner only — no intervening "it") so the
    // idioms don't trip it.
    pattern:
      /\b(?:kill(?:ing|ed|s)?|murder(?:ing|ed|s)?)\s+(?:(?:the|all|those|these|some|any|innocent|helpless|defenseless|defenceless|unarmed|more)\s+){0,2}(?:people|persons?|children|child|kids?|civilians?|students?|humans?|victims?|hostages?|prisoners?|babies|infants?|toddlers?|each ?other)\b/i,
  },

  // ─── Weapons of mass harm / making instructions ───────────────────
  {
    category: "weapons",
    label: "weapon-of-mass-harm construction",
    pattern:
      /\b(?:how to|build|make|making|construct|assemble|create)\b[\s\w'",-]{0,24}\b(?:bomb|ied|pipe ?bomb|pressure ?cooker ?bomb|grenade|explosive|explosives|dirty ?bomb|nerve ?agent|sarin|vx ?gas|bioweapon|biological ?weapon|chemical ?weapon|nuclear ?(?:bomb|weapon))\b/i,
  },
  {
    category: "weapons",
    label: "weapon-of-mass-harm",
    pattern: /\b(?:suicide ?(?:vest|bomb\w*)|pipe ?bomb|dirty ?bomb|pressure ?cooker ?bomb|car ?bomb|nerve ?agent|nail ?bomb)\b/i,
  },

  // ─── Terrorism / extremism ────────────────────────────────────────
  {
    category: "terrorism",
    label: "terrorism / extremist content",
    pattern: /\b(?:terror(?:ist|ism)? attack|plan(?:ning)? (?:a |an )?(?:terror|bombing|massacre)|isis|isil|al-?qaeda|jihad\w* attack|ethnic cleansing|genocid\w*)\b/i,
  },

  // ─── Self-harm / suicide methods ──────────────────────────────────
  {
    category: "self_harm",
    label: "self-harm / suicide method",
    pattern:
      /\b(?:how to|best way to|easiest way to|painless way to)\b[\s\w'",-]{0,24}\b(?:kill myself|commit suicide|end my life|hang myself|overdose|kill yourself)\b|\b(?:commit suicide|kill myself)\b/i,
  },
];

/**
 * Deterministically screen a prompt for harmful content. Pure (no
 * network, no model). Returns the first matching rule or `{ safe: true }`.
 * Empty / non-string input is treated as safe — upstream validators
 * already reject too-short prompts.
 */
export function screenPrompt(input: string | null | undefined): PromptScreenResult {
  if (!input || typeof input !== "string") return { safe: true };
  const text = input.normalize("NFKC");

  for (const rule of RULES) {
    const m = rule.pattern.exec(text);
    if (m) {
      return { safe: false, category: rule.category, label: rule.label, matched: m[0] };
    }
  }

  // Slurs / hate terms come from the shared explicit lexicon (whole words,
  // leetspeak + masking aware, idioms like "chink in the armor" excluded).
  const slur = lexiconTermsIn(text, "hate")[0];
  if (slur) {
    return {
      safe: false,
      category: "hate_slur",
      label: "hate speech / slur",
      matched: slur,
    };
  }

  return { safe: true };
}

/**
 * User-facing block message keyed by category. Deliberately does NOT
 * echo the offending text. Generic enough to be safe to surface, specific
 * enough that a well-intentioned user can self-correct.
 */
export function userBlockMessage(category: HarmCategory): string {
  switch (category) {
    case "csam":
    case "sexual_violence":
      return "This request was blocked because it appears to describe sexual content involving minors or non-consensual acts. This content is prohibited and may be reported.";
    case "violence":
      return "This request was blocked because it appears to depict graphic violence against people. Please revise your prompt to remove violent content.";
    case "weapons":
    case "terrorism":
      return "This request was blocked because it appears to involve weapons of mass harm or extremist content. Please revise your prompt.";
    case "self_harm":
      return "This request was blocked because it appears to involve self-harm. If you are struggling, please reach out to a crisis line such as 988 (US). Generation of this content is not permitted.";
    case "hate_slur":
      return "This request was blocked because it contains hate speech or a slur. Please revise your prompt.";
    default:
      return "This request was blocked because it appears to describe harmful content. Please revise your prompt.";
  }
}

/**
 * Thrown by {@link assertPromptSafe} and by `LLMClient.dispatch` when a
 * prompt is blocked. Extends {@link AppError} so the global error handler
 * maps it to a clean 422 with the right code automatically — no per-route
 * handling needed (same pattern as `TokenBudgetExceededError`). `category`
 * and `matched` are attached for SuperAdmin telemetry / abuse review.
 */
export class PromptBlockedError extends AppError {
  readonly category: HarmCategory;
  readonly matched?: string;
  constructor(result: PromptScreenResult) {
    const category = result.category ?? "violence";
    super("CONTENT_BLOCKED", userBlockMessage(category), 422);
    this.name = "PromptBlockedError";
    this.category = category;
    this.matched = result.matched;
  }
}

/** Screen a prompt and throw {@link PromptBlockedError} if it is unsafe. */
export function assertPromptSafe(input: string | null | undefined): void {
  const result = screenPrompt(input);
  if (!result.safe) {
    // Server-side breadcrumb — the matched fragment never reaches the client.
    logger.warn("[promptGuard] blocked", {
      category: result.category,
      label: result.label,
      matched: (result.matched ?? "").slice(0, 80),
    });
    throw new PromptBlockedError(result);
  }
}
