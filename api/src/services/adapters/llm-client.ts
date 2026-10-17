/**
 * LLMClient — single port through which route handlers talk to the LLM.
 *
 * One transport: the Builderforce gateway via `@seanhogg/builderforce-sdk`
 * (≥0.4.0). Vendor identity is invisible to route code — it's encoded
 * in the per-use-case profile table over in providers.ts and signalled
 * to the gateway via vendor-prefixed model strings (`openrouter/...`,
 * `cerebras/...`, `ollama/...`). Per the gateway docs, model is a HINT
 * not a hard pin; the gateway retains substitution rights on cooldown
 * / outage. We surface `_builderforce.resolvedModel` so SA can detect
 * substitution after the fact (gap #515 tracks the risk for
 * latency-critical use cases like `match`).
 *
 * Two non-negotiable invariants:
 *
 *   1. Every call MUST declare a `useCase`. We look up the profile
 *      (model + temperature + maxTokens + cross-provider fallback chain)
 *      in `USE_CASE_PROFILES` and apply it. Routes do NOT pick `model`
 *      / `temperature` directly — those are product decisions.
 *
 *   2. Vendor identity is invisible to end users. SA can override the
 *      profile via `_saOverride` for A/B testing; the facade strips
 *      `_saOverride` for non-SA callers.
 *
 * This file is a thin facade: the implementation lives in ./llm/
 * (types, client factory, dispatch transport, routing, metering,
 * json-schema coercion/validation, dispatch-errors) and streaming in
 * ./llm-stream.ts. Every name callers import from here is re-exported.
 */

export type { LLMStreamSink } from "./llm-stream.js";

export {
  toClientUsage,
  type ToolSpec,
  type ToolCall,
  type LLMContentPart,
  type LLMMessage,
  type LLMOptions,
  type LLMMessagesOptions,
  type LLMUsage,
  type ClientUsage,
  type LLMResult,
  type LLMCallOpts,
  type LLMEnv,
  type LLMClient,
} from "./llm/types.js";

export {
  defineLenientIngest,
  estimateSchemaStates,
  deriveStrictJsonSchema,
  toStrictSafeSchema,
  isTruncatedJson,
  type LenientIngest,
} from "./llm/json-schema.js";

export {
  LLMDispatchError,
  looksLikeSchemaRejection,
  isRequestShapeCascade,
  classifyAttemptError,
  isChainTerminal,
  type LLMFailoverEvent,
  type LLMDispatchAttempt,
} from "./llm/dispatch-errors.js";

export { chargeLedger } from "./llm/metering.js";

export {
  createLLMClient,
  createNoKeyLLMClient,
  hasAnyLLMProviderKey,
} from "./llm/client.js";
