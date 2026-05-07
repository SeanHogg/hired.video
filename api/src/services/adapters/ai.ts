// ai.ts — Centralised LLM helper with model fallback chain.
//
// Every call site MUST declare a `useCase`. The facade looks up the
// per-use-case profile (model + temperature + maxTokens) in
// `USE_CASE_PROFILES` and applies it; callers do not (and cannot) pass
// model / temperature / maxTokens directly. End users never see or
// configure those values — they're product decisions, not knobs.
//
// SA-only overrides are reachable through `createLLMClient(env, user,
// useCase)` in llm-client.ts; the lower-level helpers in this file
// always honor the registered profile.
//
// HTTP transport for OpenAI-compatible providers (OpenRouter, Cerebras,
// future vendors) lives in `openai-compat.ts`. This file owns the
// fallback-chain loop and the public surface routes import.

import { z } from "zod";
import {
  PROVIDERS,
  defaultModelOf,
  fallbackChainOf,
  resolveProfileForUseCase,
  resolveProviderForModel,
  type LLMUseCase,
  type ProviderId,
} from "./providers.js";
import {
  callOpenAICompatProvider,
  type CompatMessage,
  type ToolCall,
  type ToolSpec,
} from "./openai-compat.js";

export type { ToolCall, ToolSpec } from "./openai-compat.js";

export interface LLMOptions {
  /** Required. Drives model + temperature + maxTokens via USE_CASE_PROFILES. */
  useCase: LLMUseCase;
  systemPrompt: string;
  userMessage: string;
  responseFormat?: "json_object" | "text";
  /**
   * SA-only override hatch. Ignored by the lower-level helpers; only
   * `createLLMClient(env, user, useCase)` honors this when the caller
   * is a SuperAdmin. End users can never set this.
   */
  _saOverride?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    provider?: ProviderId;
  };
}

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Set on assistant messages that returned tool_calls. Replay verbatim
   *  when continuing a multi-turn tool-calling conversation. */
  tool_calls?: ToolCall[];
  /** Set on `role: "tool"` messages — the id of the assistant tool_call
   *  this message is answering. */
  tool_call_id?: string;
  /** Set on `role: "tool"` messages — the function name that produced
   *  this result. Some providers require it. */
  name?: string;
}

export interface LLMMessagesOptions {
  /** Required. Drives model + temperature + maxTokens via USE_CASE_PROFILES. */
  useCase: LLMUseCase;
  messages: LLMMessage[];
  responseFormat?: "json_object" | "text";
  /** Function-calling tool catalog. When present, the model may return
   *  `tool_calls` instead of (or in addition to) prose; the caller is
   *  responsible for executing the calls and feeding results back on the
   *  next turn. */
  tools?: ToolSpec[];
  toolChoice?: "auto" | "none" | "required";
  /** SA-only override hatch. See LLMOptions._saOverride. */
  _saOverride?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    provider?: ProviderId;
  };
}

/**
 * Token usage parsed from the vendor's `usage` field. Use this to bill
 * the user for the actual tokens consumed (do NOT estimate from text
 * length — that approach is wildly inaccurate, especially for non-English
 * content).
 */
export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Model that actually answered (after fallback chain). May differ from
   *  the requested model. */
  model: string;
}

export interface LLMResult {
  content: string;
  /** Tool calls the model wants the caller to execute. Empty array when
   *  none — callers can just check `toolCalls.length`. */
  toolCalls: ToolCall[];
  /** `tool_calls` when the stop reason was a tool request, `stop` for a
   *  normal completion. Useful for the chat-route loop. */
  finishReason: string;
  usage: LLMUsage;
}

/**
 * Walk the provider's fallback chain, trying the requested model first.
 * Returns on the first success; throws when every model fails.
 *
 * Pulled out because both `callLLMWithUsage` and
 * `callLLMWithMessagesAndUsage` previously duplicated this loop.
 */
async function tryProviderChain(
  providerId: ProviderId,
  apiKey: string,
  requestedModel: string | undefined,
  messages: Array<CompatMessage | { role: string; content: string }>,
  options: {
    temperature: number;
    responseFormat: "json_object" | "text";
    maxTokens?: number;
    tools?: ToolSpec[];
    toolChoice?: "auto" | "none" | "required";
  },
): Promise<LLMResult> {
  const provider = PROVIDERS[providerId];
  const startModel = requestedModel ?? defaultModelOf(provider);
  const chain = fallbackChainOf(provider);
  const modelsToTry = [startModel, ...chain.filter((m) => m !== startModel)];
  const errors: string[] = [];

  for (const m of modelsToTry) {
    try {
      return await callOpenAICompatProvider(provider, apiKey, m, messages, options);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`[${m}] ${msg}`);
      console.warn(`[ai] ${provider.label}/${m} failed, trying next...`, msg.slice(0, 150));
    }
  }

  throw new Error(`All ${provider.label} models failed:\n${errors.join("\n")}`);
}

/**
 * Call the chat-completions endpoint with automatic model fallback.
 * Returns BOTH the content and the parsed token usage so the caller can
 * record exact billing data via `recordTokenUsage()`.
 *
 * Tries the requested model first, then falls back through the provider's
 * chain until one succeeds. Logs each failure for debugging.
 *
 * @param apiKey   – pass the API key for whichever provider the model
 *                   belongs to. With `createLLMClient(env)` you don't
 *                   have to think about this; legacy call sites pass
 *                   `c.env.OPENROUTER_API_KEY` and stick with OpenRouter.
 * @param options  – prompt, model, temperature, etc.
 * @returns        { content, usage } — content is the raw string from the
 *                 first choice; usage is the parsed token counts.
 * @throws         only if ALL models in the chain fail
 */
export async function callLLMWithUsage(
  apiKey: string,
  options: LLMOptions,
): Promise<LLMResult> {
  const {
    useCase,
    systemPrompt,
    userMessage,
    responseFormat = "json_object",
    _saOverride,
  } = options;

  const profile = resolveProfileForUseCase(useCase);
  const model = _saOverride?.model ?? profile.model;
  const temperature = _saOverride?.temperature ?? profile.temperature;
  const maxTokens = _saOverride?.maxTokens ?? profile.maxTokens;
  const providerId = _saOverride?.provider ?? resolveProviderForModel(model);

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  return tryProviderChain(providerId, apiKey, model, messages, {
    temperature,
    responseFormat,
    maxTokens,
    // Single-shot prompt API does not support tools — keep it that way so
    // existing JSON-mode callers don't have their behaviour change.
  });
}

/**
 * Call the LLM and parse the JSON response against a Zod schema. Returns
 * the parsed value alongside the raw token usage. Routes should wrap
 * this in `aiCall()`/`aiCallJson()` from `ai-call.ts` so the usage is
 * billed automatically; service-layer callers without a Hono context
 * use `meteredCall()` for the same purpose.
 */
export async function callLLMJsonWithUsage<T>(
  apiKey: string,
  options: LLMOptions,
  schema: z.ZodType<T>,
): Promise<{ data: T; usage: LLMUsage }> {
  const result = await callLLMWithUsage(apiKey, { ...options, responseFormat: "json_object" });
  const stripped = result.content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const parsed = schema.safeParse(JSON.parse(stripped));
  if (!parsed.success) throw new Error(`LLM returned invalid schema: ${parsed.error.message}`);
  return { data: parsed.data, usage: result.usage };
}

/**
 * Call the chat-completions endpoint with a full messages array AND
 * return the parsed token usage. Preferred over `callLLMWithMessages`
 * for multi-turn conversations that need to be billed.
 */
export async function callLLMWithMessagesAndUsage(
  apiKey: string,
  options: LLMMessagesOptions,
): Promise<LLMResult> {
  const { useCase, messages, responseFormat = "text", tools, toolChoice, _saOverride } = options;

  const profile = resolveProfileForUseCase(useCase);
  const model = _saOverride?.model ?? profile.model;
  const temperature = _saOverride?.temperature ?? profile.temperature;
  const maxTokens = _saOverride?.maxTokens ?? profile.maxTokens;
  const providerId = _saOverride?.provider ?? resolveProviderForModel(model);

  return tryProviderChain(providerId, apiKey, model, messages, {
    temperature,
    responseFormat,
    maxTokens,
    tools,
    toolChoice,
  });
}

/**
 * Model catalog — derived from `PROVIDERS[*].models` so the catalog can
 * never drift out of sync with what each vendor actually serves.
 *
 * Used by the SA admin endpoints (the catalog is gated to SuperAdmin —
 * end users don't see vendor identity). Adding a model is a single edit
 * in providers.ts; the catalog, the routing map, and the runtime
 * fallback chain all pick it up automatically.
 */
export interface ModelCatalogEntry {
  id: string;
  label: string;
  tier: "free" | "paid";
  context: number;
  provider: ProviderId;
}

export const MODEL_CATALOG: ReadonlyArray<ModelCatalogEntry> = (
  Object.keys(PROVIDERS) as ProviderId[]
).flatMap((id) =>
  PROVIDERS[id].models.map((m): ModelCatalogEntry => ({ ...m, provider: id })),
);
