// Per-model-family request rules for the Builderforce gateway — the ONE place
// that knows a model family's wire quirks, so profile config (providers.ts)
// stays pure "which model" data and the dispatch loop (llm-client.ts) never
// branches on a model name.
//
// Source: Builderforce gateway guidance (2026-10-04) for Claude 5.5:
//   • Direct Anthropic ids are bare (`claude-opus-5-5`), billed through the
//     gateway's own Anthropic account. `anthropic/claude-opus-5-5` is NOT a
//     real id (OpenRouter spells versions with a dot) — the gateway rejected
//     it and silently cascaded to other models.
//   • Opus/Sonnet 5.5 always think, and thinking counts toward `max_tokens` —
//     a small cap runs out before any visible text.
//   • Claude 5.x rejects sampling parameters (`temperature`).
//   • Forced tool use (`required`) is downgraded to `auto`.
//   • Direct Claude ids are never listed by `sdk.models.list()`, so the
//     catalog audit must probe them instead of diffing the list.
//   • `modelStrict: true` = the named model or `503 model_unavailable`; the
//     dispatch chain treats that as "advance to my next fallback". Used only
//     where the exact model matters — free-pool legs keep gateway failover.

import type { InferenceProfile } from "./providers.js";

/** Direct Anthropic model ids, served by the gateway's own Anthropic account. */
export const CLAUDE_OPUS = "claude-opus-5-5";
export const CLAUDE_SONNET = "claude-sonnet-5-5";

/** Floor for `max_tokens` on always-thinking models: thinking + answer must fit. */
const THINKING_MAX_TOKENS_FLOOR = 16_000;

/** Thinking at a 16k cap routinely outlives the SDK's 60s default. */
const THINKING_ATTEMPT_TIMEOUT_MS = 120_000;

interface ModelFamilyRule {
  matches: (model: string) => boolean;
  /** Pin with `modelStrict` — named model or 503, never a silent swap. */
  strictPin: boolean;
  /** Whether the family accepts `temperature`. */
  acceptsSampling: boolean;
  /** Minimum `max_tokens` (thinking budget included). */
  minMaxTokens?: number;
  /** Whether `tool_choice: "required"` is honoured. */
  forcedToolChoice: boolean;
  /** Whether `sdk.models.list()` lists this id (else the audit probes it). */
  listedInCatalog: boolean;
  /** Per-attempt timeout when the caller didn't set one. */
  attemptTimeoutMs?: number;
}

const DEFAULT_RULE: ModelFamilyRule = {
  matches: () => true,
  strictPin: false,
  acceptsSampling: true,
  forcedToolChoice: true,
  listedInCatalog: true,
};

/** First match wins; DEFAULT_RULE is the catch-all. A new family is a new
 *  entry here, never a branch in the dispatch loop. */
const MODEL_FAMILY_RULES: readonly ModelFamilyRule[] = [
  {
    // Direct Claude 5.x (Opus/Sonnet): always-thinking, no sampling params.
    matches: (m) => /^claude-(opus|sonnet)-5(-|$)/.test(m),
    strictPin: true,
    acceptsSampling: false,
    minMaxTokens: THINKING_MAX_TOKENS_FLOOR,
    forcedToolChoice: false,
    listedInCatalog: false,
    attemptTimeoutMs: THINKING_ATTEMPT_TIMEOUT_MS,
  },
  {
    // Any other direct Anthropic id (e.g. claude-haiku-4-5-20251001).
    matches: (m) => m.startsWith("claude-"),
    strictPin: true,
    acceptsSampling: true,
    forcedToolChoice: true,
    listedInCatalog: false,
  },
];

function ruleFor(model: string): ModelFamilyRule {
  return MODEL_FAMILY_RULES.find((r) => r.matches(model)) ?? DEFAULT_RULE;
}

export type ToolChoice = "auto" | "none" | "required";

/** The model-dependent slice of a chat-completions request. */
export interface ModelRequestParams {
  model: string;
  modelStrict?: true;
  temperature?: number;
  max_tokens?: number;
  /** Present only when tools are being sent. */
  tool_choice?: ToolChoice;
  /** Default per-attempt timeout for this family (caller override wins). */
  attemptTimeoutMs?: number;
}

/** Translate a profile into wire params that the profile's model family
 *  actually accepts. Pure. */
export function buildModelRequestParams(
  profile: InferenceProfile,
  toolChoice: ToolChoice | undefined,
  hasTools: boolean,
): ModelRequestParams {
  const rule = ruleFor(profile.model);
  const maxTokens =
    rule.minMaxTokens !== undefined
      ? Math.max(profile.maxTokens ?? 0, rule.minMaxTokens)
      : profile.maxTokens;
  const choice = toolChoice ?? "auto";
  return {
    model: profile.model,
    ...(rule.strictPin ? { modelStrict: true as const } : {}),
    ...(rule.acceptsSampling ? { temperature: profile.temperature } : {}),
    ...(maxTokens ? { max_tokens: maxTokens } : {}),
    ...(hasTools
      ? { tool_choice: choice === "required" && !rule.forcedToolChoice ? "auto" : choice }
      : {}),
    ...(rule.attemptTimeoutMs !== undefined ? { attemptTimeoutMs: rule.attemptTimeoutMs } : {}),
  };
}

/** Whether `sdk.models.list()` can confirm this model. When false, the
 *  catalog audit must verify it with a strict probe instead. */
export function isListedInGatewayCatalog(model: string): boolean {
  return ruleFor(model).listedInCatalog;
}
