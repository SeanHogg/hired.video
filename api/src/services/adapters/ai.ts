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
  resolveProfileForUseCase,
  resolveProviderForModel,
  type LLMUseCase,
  type ProviderId,
} from "./providers.js";
import { callOpenAICompatProvider } from "./openai-compat.js";

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
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMMessagesOptions {
  /** Required. Drives model + temperature + maxTokens via USE_CASE_PROFILES. */
  useCase: LLMUseCase;
  messages: LLMMessage[];
  responseFormat?: "json_object" | "text";
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
  messages: Array<{ role: string; content: string }>,
  options: { temperature: number; responseFormat: "json_object" | "text"; maxTokens?: number },
): Promise<LLMResult> {
  const provider = PROVIDERS[providerId];
  const startModel = requestedModel ?? provider.defaultModel;
  const modelsToTry = [startModel, ...provider.fallbackChain.filter((m) => m !== startModel)];
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
  });
}

/**
 * Backwards-compatible wrapper that returns only the content string.
 *
 * @deprecated Use `callLLMWithUsage` and pass the resulting `usage` to
 *             `recordTokenUsage()` so the call is billed correctly.
 */
export async function callLLM(apiKey: string, options: LLMOptions): Promise<string> {
  const result = await callLLMWithUsage(apiKey, options);
  return result.content;
}

/**
 * Call the LLM and parse the JSON response against a Zod schema.
 * Strips markdown code fences before parsing.
 *
 * @deprecated Use `callLLMJsonWithUsage` for billable routes.
 */
export async function callLLMJson<T>(
  apiKey: string,
  options: LLMOptions,
  schema: z.ZodType<T>,
): Promise<T> {
  const result = await callLLMJsonWithUsage(apiKey, options, schema);
  return result.data;
}

/**
 * Same as `callLLMJson` but returns the parsed Zod result alongside the
 * raw token usage. Use this in any route that needs to record billing
 * via `recordTokenUsage()`.
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
  const { useCase, messages, responseFormat = "text", _saOverride } = options;

  const profile = resolveProfileForUseCase(useCase);
  const model = _saOverride?.model ?? profile.model;
  const temperature = _saOverride?.temperature ?? profile.temperature;
  const maxTokens = _saOverride?.maxTokens ?? profile.maxTokens;
  const providerId = _saOverride?.provider ?? resolveProviderForModel(model);

  return tryProviderChain(providerId, apiKey, model, messages, {
    temperature,
    responseFormat,
    maxTokens,
  });
}

/**
 * Backwards-compatible wrapper that returns only the content string.
 * @deprecated Use `callLLMWithMessagesAndUsage` and bill the call.
 */
export async function callLLMWithMessages(
  apiKey: string,
  options: LLMMessagesOptions,
): Promise<string> {
  const result = await callLLMWithMessagesAndUsage(apiKey, options);
  return result.content;
}

/**
 * Retrieve the OpenRouter API key from the Worker environment.
 *
 * Kept for backwards compatibility with the ~30 routes that already use
 * it. New code should use `getProviderApiKey(env, providerId)` from
 * providers.ts, or — better — `createLLMClient(env)` which handles key
 * resolution internally.
 */
export function getApiKey(env: { OPENROUTER_API_KEY?: string }): string | undefined {
  const key =
    env?.OPENROUTER_API_KEY ||
    (globalThis as { __ENV?: { OPENROUTER_API_KEY?: string } }).__ENV?.OPENROUTER_API_KEY ||
    undefined;
  return key && key.trim() ? key.trim() : undefined;
}

/**
 * Model catalog — single source of truth for all model metadata.
 * Used by the API fallback chains + exposed via GET /api/ai/models for
 * the frontend settings UI. Each entry tags its provider so the frontend
 * can group models by vendor.
 *
 * Keep this in sync with `MODEL_TO_PROVIDER` in providers.ts (the router
 * map) and with the per-provider `fallbackChain` (the runtime chain).
 */
export const MODEL_CATALOG: Array<{
  id: string;
  label: string;
  tier: "free" | "paid";
  context: number;
  provider: ProviderId;
}> = [
  // ── OpenRouter — free, user-validated 2026-04-20 ──────────────────────
  { id: "google/gemma-4-31b-it:free",                label: "Gemma 4 31B",           tier: "free", context: 131_072, provider: "openrouter" },
  { id: "google/gemma-4-26b-a4b-it:free",            label: "Gemma 4 26B A4B",       tier: "free", context: 131_072, provider: "openrouter" },
  { id: "openrouter/elephant-alpha",                 label: "Auto (best available)", tier: "free", context: 200_000, provider: "openrouter" },
  { id: "nousresearch/hermes-3-llama-3.1-405b:free", label: "Hermes 3 Llama 405B",   tier: "free", context: 131_072, provider: "openrouter" },
  { id: "tencent/hy3-preview:free",                  label: "Tencent HunYuan 3",     tier: "free", context: 131_072, provider: "openrouter" },
  { id: "openai/gpt-oss-120b:free",                  label: "GPT OSS 120B",          tier: "free", context: 131_072, provider: "openrouter" },
  { id: "meta-llama/llama-3.3-70b-instruct:free",    label: "Llama 3.3 70B",         tier: "free", context: 131_072, provider: "openrouter" },
  { id: "z-ai/glm-4.5-air:free",                     label: "GLM 4.5 Air",           tier: "free", context: 128_000, provider: "openrouter" },
  { id: "qwen/qwen3-next-80b-a3b-instruct:free",     label: "Qwen 3 80B MoE",        tier: "free", context: 262_144, provider: "openrouter" },
  { id: "nvidia/nemotron-nano-9b-v2:free",           label: "Nemotron Nano 9B",      tier: "free", context: 128_000, provider: "openrouter" },
  { id: "qwen/qwen3-coder:free",                     label: "Qwen 3 Coder",          tier: "free", context: 256_000, provider: "openrouter" },
  // ── OpenRouter — paid ─────────────────────────────────────────────────
  { id: "openai/gpt-4o-mini",                        label: "GPT-4o Mini",           tier: "paid", context: 128_000, provider: "openrouter" },
  { id: "openai/gpt-4o",                             label: "GPT-4o",                tier: "paid", context: 128_000, provider: "openrouter" },
  { id: "anthropic/claude-3-haiku",                  label: "Claude 3 Haiku",        tier: "paid", context: 200_000, provider: "openrouter" },
  // ── Cerebras — extreme low-latency inference ──────────────────────────
  { id: "llama3.1-8b",                               label: "Llama 3.1 8B (Cerebras)",      tier: "free", context: 8_192,  provider: "cerebras" },
  { id: "qwen-3-235b-a22b-instruct-2507",            label: "Qwen 3 235B A22B (Cerebras)",  tier: "free", context: 65_536, provider: "cerebras" },
];
