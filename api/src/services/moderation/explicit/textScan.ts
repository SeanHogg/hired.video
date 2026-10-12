/**
 * Explicit text scan: the deterministic floor (shared lexicon + the
 * prompt-guard's contextual violence / CSAM / weapons rules), then the LLM
 * classifier for what words alone can't judge.
 *
 *   floor hit                     → block (no model call)
 *   classifier says pass / block  → that verdict
 *   no classifier / it failed     → unscreened (fails closed for public reach)
 */
import { matchExplicitLexicon } from "../../../../../shared/moderation/explicit-lexicon.js";
import {
  PASS_VERDICT,
  normalizeCategories,
  unscreenedVerdict,
  type ExplicitCategory,
  type ExplicitVerdict,
} from "../../../../../shared/moderation/explicit.js";
import { PromptBlockedError, screenPrompt, type HarmCategory } from "../promptGuard.js";
import { TEXT_SYSTEM_PROMPT, parseClassifierVerdict } from "./classifierPrompt.js";

/** "system + user → raw model text" — the AiTextCaller port. */
export type TextClassifier = (systemPrompt: string, userMessage: string) => Promise<string>;

const MAX_TEXT_CHARS = 8000;

const GUARD_CATEGORY: Record<HarmCategory, ExplicitCategory> = {
  violence: "violence",
  weapons: "weapons",
  csam: "sexual",
  sexual_violence: "sexual",
  self_harm: "violence",
  terrorism: "violence",
  hate_slur: "hate",
};

/** The deterministic floor alone — pure, no network. Null when clean. */
export function explicitTextFloor(text: string): ExplicitVerdict | null {
  const matches = matchExplicitLexicon(text);
  const guard = screenPrompt(text);
  if (matches.length === 0 && guard.safe) return null;
  const categories = normalizeCategories([
    ...matches.map((m) => m.category),
    ...(guard.category ? [GUARD_CATEGORY[guard.category]] : []),
  ]);
  const terms = matches.map((m) => m.term);
  const reason = [
    terms.length ? `lexicon: ${terms.join(", ")}` : null,
    guard.label ? `rule: ${guard.label}` : null,
  ].filter(Boolean).join("; ");
  return { verdict: "block", categories, reason };
}

export async function scanTextExplicit(
  text: string,
  classify: TextClassifier | null,
): Promise<ExplicitVerdict> {
  const clean = (text ?? "").trim().slice(0, MAX_TEXT_CHARS);
  if (!clean) return { ...PASS_VERDICT, categories: [] };

  const floor = explicitTextFloor(clean);
  if (floor) return floor;
  if (!classify) return unscreenedVerdict("text classifier unavailable");

  try {
    return parseClassifierVerdict(await classify(TEXT_SYSTEM_PROMPT, clean));
  } catch (err) {
    if (err instanceof PromptBlockedError) {
      return { verdict: "block", categories: [GUARD_CATEGORY[err.category]], reason: `rule: ${err.category}` };
    }
    console.warn("[explicit-scan] text classifier failed:", err instanceof Error ? err.message : err);
    return unscreenedVerdict("text classifier failed");
  }
}
