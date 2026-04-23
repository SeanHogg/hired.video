// ai.ts — Centralised OpenRouter LLM helper with model fallback chain.
// All routes must use callLLM() instead of fetching OpenRouter directly,
// so the API key is always read from the Cloudflare Worker binding (c.env).

import { z } from "zod";

export interface LLMOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt: string;
  userMessage: string;
  responseFormat?: "json_object" | "text";
}

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMMessagesOptions {
  model?: string;
  temperature?: number;
  messages: LLMMessage[];
  responseFormat?: "json_object" | "text";
  maxTokens?: number;
}

/**
 * Token usage parsed from the OpenRouter `usage` field. Use this to bill
 * the user for the actual tokens consumed (do NOT estimate from text length —
 * that approach is wildly inaccurate, especially for non-English content).
 */
export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Model that actually answered (after fallback chain). May differ from the
   *  requested model. */
  model: string;
}

export interface LLMResult {
  content: string;
  usage: LLMUsage;
}

// ─── Free model fallback chain ──────────────────────────────────────────────
// Verified working on OpenRouter as of 2026-04-20 (user-validated list).
// Tried in order; first one that responds with valid JSON wins. A 404 on
// any entry costs ~1s of latency per upload, so prune aggressively when
// a model is deprecated (OpenRouter sends "free model has been deprecated"
// errors when this happens).

const FREE_FALLBACK_MODELS = [
  "google/gemma-4-31b-it:free",                     // Gemma 4 31B, JSON mode, multimodal
  "openrouter/elephant-alpha",                      // OpenRouter meta-router — auto-picks best available
  "nousresearch/hermes-3-llama-3.1-405b:free",      // Hermes 3 on Llama 405B — top-tier reasoning
  "openai/gpt-oss-120b:free",                       // OpenAI open-source 120B, strong reasoning
  "meta-llama/llama-3.3-70b-instruct:free",         // Llama 3.3 70B — solid general-purpose, tool use
  "z-ai/glm-4.5-air:free",                          // GLM 4.5 Air — fast, 128K context
  "qwen/qwen3-next-80b-a3b-instruct:free",         // Qwen 3 80B MoE, 262K context, structured output
  "nvidia/nemotron-nano-9b-v2:free",                // Compact 9B, 128K context, structured output
  "qwen/qwen3-coder:free",                          // Qwen 3 Coder — strong for structured code/JSON
];

/**
 * Call OpenRouter with a single model. Internal — use callLLM() for automatic fallback.
 * Returns both the content and the parsed token usage from OpenRouter's
 * `usage` field. If OpenRouter doesn't ship usage (some free models omit it),
 * fall back to a coarse character-based estimate.
 */
async function callOpenRouter(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  options: {
    temperature?: number;
    responseFormat?: "json_object" | "text";
    maxTokens?: number;
  } = {},
): Promise<LLMResult> {
  const {
    temperature = 0.7,
    responseFormat = "json_object",
    maxTokens,
  } = options;

  const body: Record<string, unknown> = {
    model,
    temperature,
    messages,
    // Always ask for usage so token billing is accurate.
    usage: { include: true },
  };
  if (responseFormat === "json_object") {
    body.response_format = { type: "json_object" };
  }
  if (maxTokens) {
    body.max_tokens = maxTokens;
  }

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://hired.video",
      "X-Title": "hired.video",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`OpenRouter ${res.status} [${model}]: ${errBody.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
    model?: string;
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error(`Empty LLM response from ${model}`);

  // Prefer OpenRouter's reported usage. Fall back to a coarse char/4 estimate
  // for the rare model that doesn't include it.
  const promptTokens =
    json.usage?.prompt_tokens ??
    Math.round(messages.reduce((acc, m) => acc + m.content.length, 0) / 4);
  const completionTokens =
    json.usage?.completion_tokens ?? Math.round(content.length / 4);
  const totalTokens =
    json.usage?.total_tokens ?? promptTokens + completionTokens;

  return {
    content,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens,
      model: json.model ?? model,
    },
  };
}

/**
 * Call the OpenRouter chat-completions endpoint with automatic model fallback.
 * Returns BOTH the content and the parsed token usage so the caller can
 * record exact billing data via `recordTokenUsage()`.
 *
 * Tries the requested model first, then falls back through FREE_FALLBACK_MODELS
 * until one succeeds. Logs each failure for debugging.
 *
 * @param apiKey   – pass `c.env.OPENROUTER_API_KEY` from the route handler
 * @param options  – prompt, model, temperature, etc.
 * @returns        { content, usage } — content is the raw string from the
 *                 first choice; usage is the parsed prompt/completion/total
 *                 tokens reported by OpenRouter (or estimated if missing).
 * @throws         only if ALL models in the chain fail
 */
export async function callLLMWithUsage(
  apiKey: string,
  options: LLMOptions,
): Promise<LLMResult> {
  const {
    model = "google/gemma-4-31b-it:free",
    temperature = 0.7,
    maxTokens,
    systemPrompt,
    userMessage,
    responseFormat = "json_object",
  } = options;

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  // Build ordered model list: requested model first, then fallbacks (deduped)
  const modelsToTry = [model, ...FREE_FALLBACK_MODELS.filter((m) => m !== model)];
  const errors: string[] = [];

  for (const m of modelsToTry) {
    try {
      return await callOpenRouter(apiKey, m, messages, { temperature, responseFormat, maxTokens });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`[${m}] ${msg}`);
      console.warn(`[ai] Model ${m} failed, trying next...`, msg.slice(0, 150));
    }
  }

  throw new Error(`All LLM models failed:\n${errors.join("\n")}`);
}

/**
 * Backwards-compatible wrapper around `callLLMWithUsage` that returns only
 * the content string. Prefer `callLLMWithUsage` in new code so token usage
 * can be recorded against the user's billing.
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
 * Strips markdown code fences before parsing. Returns ONLY the parsed result —
 * use `callLLMJsonWithUsage` if you need to bill for the call.
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
 * Same as `callLLMJson` but returns the parsed Zod result alongside the raw
 * token usage from OpenRouter. Use this in any route that needs to record
 * billing via `recordTokenUsage()`.
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
 * Call the OpenRouter chat-completions endpoint with a full messages array
 * AND return the parsed token usage. Preferred over `callLLMWithMessages`
 * for multi-turn conversations that need to be billed.
 */
export async function callLLMWithMessagesAndUsage(
  apiKey: string,
  options: LLMMessagesOptions,
): Promise<LLMResult> {
  const {
    model = "google/gemma-4-31b-it:free",
    temperature = 0.7,
    messages,
    responseFormat = "text",
    maxTokens,
  } = options;

  // Build ordered model list: requested model first, then fallbacks (deduped)
  const modelsToTry = [model, ...FREE_FALLBACK_MODELS.filter((m) => m !== model)];
  const errors: string[] = [];

  for (const m of modelsToTry) {
    try {
      return await callOpenRouter(apiKey, m, messages, { temperature, responseFormat, maxTokens });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`[${m}] ${msg}`);
      console.warn(`[ai] Model ${m} failed, trying next...`, msg.slice(0, 150));
    }
  }

  throw new Error(`All LLM models failed:\n${errors.join("\n")}`);
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
 * Returns undefined when not configured (routes fall back to mock).
 */
export function getApiKey(env: { OPENROUTER_API_KEY?: string }): string | undefined {
  const key =
    env?.OPENROUTER_API_KEY ||
    (globalThis as any).__ENV?.OPENROUTER_API_KEY ||
    undefined;
  return key && key.trim() ? key.trim() : undefined;
}

/**
 * Model catalog — single source of truth for all model metadata.
 * Used by API fallback chain + exposed via GET /api/ai/models for frontend.
 */
export const MODEL_CATALOG: Array<{ id: string; label: string; tier: "free" | "paid"; context: number }> = [
  // Free — user-validated list 2026-04-20 (must stay in lockstep with
  // FREE_FALLBACK_MODELS above). Context sizes are best-known values;
  // check OpenRouter's catalog if you need exact numbers for billing.
  { id: "google/gemma-4-31b-it:free",                     label: "Gemma 4 31B",            tier: "free",  context: 131_072 },
  { id: "openrouter/elephant-alpha",                      label: "Auto (best available)",  tier: "free",  context: 200_000 },
  { id: "nousresearch/hermes-3-llama-3.1-405b:free",      label: "Hermes 3 Llama 405B",    tier: "free",  context: 131_072 },
  { id: "openai/gpt-oss-120b:free",                       label: "GPT OSS 120B",           tier: "free",  context: 131_072 },
  { id: "meta-llama/llama-3.3-70b-instruct:free",         label: "Llama 3.3 70B",          tier: "free",  context: 131_072 },
  { id: "z-ai/glm-4.5-air:free",                          label: "GLM 4.5 Air",            tier: "free",  context: 128_000 },
  { id: "qwen/qwen3-next-80b-a3b-instruct:free",         label: "Qwen 3 80B MoE",         tier: "free",  context: 262_144 },
  { id: "nvidia/nemotron-nano-9b-v2:free",                label: "Nemotron Nano 9B",       tier: "free",  context: 128_000 },
  { id: "qwen/qwen3-coder:free",                          label: "Qwen 3 Coder",           tier: "free",  context: 256_000 },
  // Paid
  { id: "openai/gpt-4o-mini",                             label: "GPT-4o Mini",            tier: "paid",  context: 128_000 },
  { id: "openai/gpt-4o",                                  label: "GPT-4o",                 tier: "paid",  context: 128_000 },
  { id: "anthropic/claude-3-haiku",                       label: "Claude 3 Haiku",         tier: "paid",  context: 200_000 },
];
