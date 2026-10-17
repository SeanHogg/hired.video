/**
 * AI model rate card — what one LLM call actually costs us, in USD.
 *
 * Users are metered in raw tokens (what they see in the AI-tokens pill); this
 * table converts the SAME token counts into vendor dollars so the ledger can
 * record a real `cost` per call and SuperAdmin can watch spend + margin per
 * user. It is pricing DATA, not logic: add a row when a new model family
 * ships, never a branch.
 *
 * Rows are matched IN ORDER against the gateway's resolved model id (which may
 * be a bare Anthropic id like `claude-opus-5-5`, an OpenRouter slug like
 * `anthropic/claude-opus-5.5`, or a `:free` pool model), so put the most
 * specific pattern first. Prices are list $/1M tokens (Anthropic first-party
 * rates as of 2026-10-08). Thinking tokens arrive inside `completionTokens`
 * and bill at the output rate, which is how the vendor charges them too.
 *
 * Unknown models fall back to the most expensive model we route to, so a
 * missing row over-states cost (visible in the SA spend view) rather than
 * silently under-stating it.
 */

export interface AiModelRate {
  /** Stable id for reporting (e.g. grouping spend by family). */
  id: string;
  match: RegExp;
  inputPerMillion: number;
  outputPerMillion: number;
}

export const AI_MODEL_RATES: readonly AiModelRate[] = [
  { id: "claude-opus-5-5", match: /opus[-.]5[-.]5/i, inputPerMillion: 4, outputPerMillion: 20 },
  { id: "claude-opus", match: /opus/i, inputPerMillion: 5, outputPerMillion: 25 },
  { id: "claude-sonnet-5-5", match: /sonnet[-.]5[-.]5/i, inputPerMillion: 2, outputPerMillion: 10 },
  { id: "claude-sonnet", match: /sonnet/i, inputPerMillion: 3, outputPerMillion: 15 },
  { id: "claude-haiku", match: /haiku/i, inputPerMillion: 1, outputPerMillion: 5 },
  // OpenRouter free pool + Cloudflare Workers AI — no per-token vendor charge.
  { id: "free-pool", match: /(:free$)|(^@cf\/)/i, inputPerMillion: 0, outputPerMillion: 0 },
  { id: "cerebras", match: /^cerebras\//i, inputPerMillion: 0.1, outputPerMillion: 0.1 },
  // OpenAI Whisper ($0.006 / audio minute), metered as 200 token-equivalents
  // per minute (api/src/services/adapters/transcription.ts) → $30 / 1M.
  { id: "openai-whisper", match: /^whisper/i, inputPerMillion: 0, outputPerMillion: 30 },
];

/** Conservative fallback for an unmatched model id (priced like Opus 5.5). */
export const FALLBACK_AI_MODEL_RATE: AiModelRate = {
  id: "unpriced",
  match: /.*/,
  inputPerMillion: 4,
  outputPerMillion: 20,
};

export function aiModelRate(model: string | null | undefined): AiModelRate {
  const id = model ?? "";
  return AI_MODEL_RATES.find((r) => r.match.test(id)) ?? FALLBACK_AI_MODEL_RATE;
}

export interface AiCallTokens {
  model: string | null | undefined;
  promptTokens: number;
  completionTokens: number;
}

/** Vendor cost of one call in USD (unrounded — the ledger column is numeric). */
export function aiCallCostUsd({ model, promptTokens, completionTokens }: AiCallTokens): number {
  const rate = aiModelRate(model);
  return (
    (Math.max(0, promptTokens) * rate.inputPerMillion +
      Math.max(0, completionTokens) * rate.outputPerMillion) /
    1_000_000
  );
}
