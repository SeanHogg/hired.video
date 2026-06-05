/**
 * Content safety scan for creator-authored articles, FAQs, and guides.
 *
 * Single chokepoint: both the author-side submit-for-review handler and the
 * SuperAdmin bulk-scan handler call `scanContent()`. The route layer never
 * runs its own keyword check or its own LLM prompt.
 *
 * Output is structured (profanity / racism / ToS hits + severity) so the SA
 * queue UI can render finding chips without re-scanning, and a recommendation
 * the SA can act on with one click (approve / review / reject).
 */
import { z } from "zod";
import {
  createLLMClient,
  hasAnyLLMProviderKey,
} from "../adapters/llm-client.js";
import { HARMFUL_SLURS } from "./promptGuard.js";
import type { JwtPayload } from "../../types/index.js";
import {
  MODERATION_SEVERITY,
  type ModerationFindings,
  type ModerationSeverity,
} from "../../db/schema/articles.js";

export interface ScanInput {
  title: string;
  bodyMd: string;
  kind?: "article" | "faq" | "guide";
}

export interface ScanResult {
  score: number; // 0..1, 1 = clean
  findings: ModerationFindings;
  recommendation: "approve" | "review" | "reject";
}

// Conservative keyword fallback. NOT exhaustive — the LLM path is the primary
// detector. These are seed terms so the scan still produces non-trivial output
// when no LLM key is configured (CI, local dev) or the LLM call fails.
const PROFANITY_SEEDS = [
  "fuck", "shit", "bitch", "asshole", "cunt", "dick", "piss",
];
// Slur list is shared with the generation prompt-guard (single source of
// truth — `promptGuard.HARMFUL_SLURS`) so the article scanner and the
// generation gate can never drift on what counts as a slur.
const RACISM_SEEDS = HARMFUL_SLURS;
const TOS_SEEDS = [
  "buy followers", "guaranteed job", "click here", "free crypto",
  "send money", "pyramid scheme", "mlm opportunity",
];

const SCAN_SCHEMA = z.object({
  score: z.number().min(0).max(1),
  profanity: z.array(z.string()).default([]),
  racism: z.array(z.string()).default([]),
  tosViolations: z.array(z.string()).default([]),
  severity: z.enum(MODERATION_SEVERITY),
  rationale: z.string().max(800).optional().nullable(),
});

function matchWord(haystack: string, needle: string): boolean {
  // Word-boundary-ish match: case-insensitive, allow surrounding non-word.
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9])${escaped}([^A-Za-z0-9]|$)`, "i").test(haystack);
}

function keywordScan(text: string): ScanResult {
  const profanity = PROFANITY_SEEDS.filter((w) => matchWord(text, w));
  const racism = RACISM_SEEDS.filter((w) => matchWord(text, w));
  const tos = TOS_SEEDS.filter((w) => text.toLowerCase().includes(w));

  let severity: ModerationSeverity = "low";
  if (racism.length > 0) severity = "block";
  else if (profanity.length >= 3 || tos.length >= 2) severity = "high";
  else if (profanity.length > 0 || tos.length > 0) severity = "medium";

  const hits = profanity.length + racism.length + tos.length;
  // 1.0 clean, drop by 0.15 per hit, hard 0 when severity=block.
  const score = severity === "block" ? 0 : Math.max(0, 1 - hits * 0.15);
  const recommendation =
    severity === "block" ? "reject"
    : severity === "high" ? "review"
    : score >= 0.8 ? "approve"
    : "review";

  return {
    score,
    findings: { profanity, racism, tosViolations: tos, severity },
    recommendation,
  };
}

/**
 * Scan a single article body. Tries LLM first when a provider key is wired;
 * falls back to the keyword scan if no key or the call fails. The keyword
 * scan also runs as a floor — any seed-list hit raises severity even when the
 * LLM is more lenient.
 */
export async function scanContent(
  input: ScanInput,
  caller: JwtPayload | null | undefined,
): Promise<ScanResult> {
  const text = `${input.title}\n\n${input.bodyMd}`.slice(0, 8000);
  const floor = keywordScan(text);

  const env = { BUILDERFORCE_API_KEY: process.env.BUILDERFORCE_API_KEY };
  if (!hasAnyLLMProviderKey(env)) {
    return floor;
  }

  try {
    const llm = createLLMClient(env, caller);
    const { data } = await llm.callJson(
      "content_safety_scan",
      {
        useCase: "reviews",
        systemPrompt:
          "You are a content safety classifier for a hiring marketplace. " +
          "Inspect user-authored long-form content (article / FAQ / guide) for " +
          "profanity, racism / slurs, and Terms-of-Service violations " +
          "(scams, spam, monetised get-rich-quick claims, links to off-platform " +
          "transactions, unsubstantiated guarantees). Return JSON only.",
        userMessage:
          `Kind: ${input.kind ?? "article"}\nTitle: ${input.title}\n\n` +
          `Body:\n${input.bodyMd.slice(0, 6000)}\n\n` +
          `Return JSON: { "score": 0..1 (1 = clean), "profanity": string[], ` +
          `"racism": string[], "tosViolations": string[], ` +
          `"severity": "low"|"medium"|"high"|"block", ` +
          `"rationale": "<one short sentence>" }`,
      },
      SCAN_SCHEMA,
      // This call is FED the flagged content on purpose — opt out of the
      // generation prompt-guard so the scanner doesn't block itself.
      { skipContentGuard: true },
    );

    // Merge LLM findings with the keyword floor — anything the floor caught
    // is added even if the LLM missed it, and severity is the max of the two.
    const profanity = Array.from(new Set([...floor.findings.profanity, ...data.profanity]));
    const racism = Array.from(new Set([...floor.findings.racism, ...data.racism]));
    const tos = Array.from(new Set([...floor.findings.tosViolations, ...data.tosViolations]));
    const severity = maxSeverity(floor.findings.severity, data.severity);
    const score = Math.min(floor.score, data.score);
    const recommendation =
      severity === "block" ? "reject"
      : severity === "high" ? "review"
      : score >= 0.8 ? "approve"
      : "review";

    return {
      score,
      findings: {
        profanity,
        racism,
        tosViolations: tos,
        severity,
        rationale: data.rationale ?? undefined,
      },
      recommendation,
    };
  } catch {
    return floor;
  }
}

function maxSeverity(a: ModerationSeverity, b: ModerationSeverity): ModerationSeverity {
  const order: Record<ModerationSeverity, number> = { low: 0, medium: 1, high: 2, block: 3 };
  return order[a] >= order[b] ? a : b;
}
