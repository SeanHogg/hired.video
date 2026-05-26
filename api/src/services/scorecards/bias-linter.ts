/**
 * Scorecard bias linter (#1385).
 *
 * Sends the evaluator's free-text scorecard prose (`summary` +
 * `strengths` + `concerns`) through the existing LLM stack with a
 * strict JSON-schema prompt asking for coded-language flags. Returns a
 * list of phrase-level findings the frontend renders as inline pills.
 *
 * Falls back to an empty-flags response when no LLM provider is
 * configured (local dev) — the form still works, the linter just
 * doesn't surface anything. Errors surface as a 503 so the UI can show
 * "linter unavailable" without blocking submit.
 */

import { z } from "zod";
import type { Context } from "hono";
import type { AppEnv } from "../../types/index.js";
import {
  createLLMClient,
  defineLenientIngest,
  hasAnyLLMProviderKey,
} from "../adapters/llm-client.js";
import { TokenBudgetExceededError } from "../../domains/billing/token-ledger.js";
import { AppError } from "../../middleware/errorHandler.js";

export const BiasFlagSchema = z.object({
  phrase: z.string().min(1).max(300),
  /** 'low' | 'medium' | 'high' — drives the badge tone in the UI. */
  severity: z.enum(["low", "medium", "high"]),
  rationale: z.string().min(1).max(500),
  /** Optional rewrite suggestion. */
  suggestedReplacement: z.string().max(500).optional(),
});
export type BiasFlag = z.infer<typeof BiasFlagSchema>;

export const BiasLintResponseSchema = z.object({
  flags: z.array(BiasFlagSchema).max(20),
});
export type BiasLintResponse = z.infer<typeof BiasLintResponseSchema>;

const ingest = defineLenientIngest<BiasLintResponse, BiasLintResponse>({
  wireSchema: BiasLintResponseSchema,
  coerce: (wire) => wire,
});

const SYSTEM_PROMPT = `You are a bias-detection linter for interview scorecards. The evaluator's prose may contain coded or biased language that has no place in a hiring decision. Examples to flag:

- Subjective "culture fit" / "vibe" / "presence" descriptors
- Gendered language ("bossy", "abrasive", "polished")
- Age-correlated terms ("seasoned", "junior energy", "old-school")
- Comments about non-job attributes (family, accent, weight, attractiveness)
- Race/ethnicity-correlated descriptors
- Personality-trait language masquerading as performance assessment

Return STRICT JSON matching the schema. For each flag, include:
- "phrase": the exact phrase in the input
- "severity": "high" for protected-class language, "medium" for vague subjective language, "low" for mild
- "rationale": one sentence explaining the concern
- "suggestedReplacement": optional — a job-relevant rephrasing

If the prose is clean, return {"flags":[]}.`;

export async function lintScorecardText(
  c: Context<AppEnv>,
  input: {
    summary?: string | null;
    strengths?: string | null;
    concerns?: string | null;
  },
): Promise<BiasLintResponse> {
  const combined = [
    input.summary ? `SUMMARY:\n${input.summary}` : null,
    input.strengths ? `STRENGTHS:\n${input.strengths}` : null,
    input.concerns ? `CONCERNS:\n${input.concerns}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  if (combined.trim().length < 10) return { flags: [] };
  if (!hasAnyLLMProviderKey(c.env as any)) return { flags: [] };

  try {
    const client = createLLMClient(c.env as any, c.var.user);
    const { data } = await client.callJsonLenient(
      "scorecard_bias_check",
      {
        useCase: "scorecard_bias_check",
        systemPrompt: SYSTEM_PROMPT,
        userMessage: combined.slice(0, 8000),
      },
      ingest,
    );
    return data;
  } catch (err) {
    if (err instanceof TokenBudgetExceededError) throw err;
    console.error("[scorecard_bias_check] LLM error:", err);
    throw new AppError(
      "BIAS_LINTER_UNAVAILABLE",
      "Bias linter is temporarily unavailable.",
      503,
    );
  }
}
