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
}

// ─── Free model fallback chain ──────────────────────────────────────────────
// Ordered by quality (best first). All are free-tier on OpenRouter ($0/token).
// If the requested model fails, we try each fallback in order.

const FREE_FALLBACK_MODELS = [
  // Tier 1 — best for structured output (resume parsing, script generation)
  "qwen/qwen3.6-plus:free",                        // Best free model — 1M context, structured output, tool use, multimodal
  "nvidia/nemotron-3-super-120b-a12b:free",         // 120B MoE, 262K context, structured output + tools
  "minimax/minimax-m2.5:free",                      // Strong general-purpose, 196K context, structured output
  "arcee-ai/trinity-large-preview:free",            // 131K context, full structured output + tools
  "meta-llama/llama-3.3-70b-instruct:free",         // Proven 70B, 65K context, tool use
  // Tier 2 — solid mid-range
  "qwen/qwen3-next-80b-a3b-instruct:free",         // 80B MoE, 262K context, structured output
  "nvidia/nemotron-nano-9b-v2:free",                // Compact 9B, 128K context, structured output
  "google/gemma-3-27b-it:free",                     // 27B, 131K context, multimodal, JSON mode
  "openai/gpt-oss-120b:free",                       // OpenAI open-source 120B, reasoning
  // Meta-router — auto-picks best available free model
  "openrouter/free",                                // Fallback of last resort — routes to whatever is up
];

/**
 * Call OpenRouter with a single model. Internal — use callLLM() for automatic fallback.
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
): Promise<string> {
  const {
    temperature = 0.7,
    responseFormat = "json_object",
    maxTokens,
  } = options;

  const body: Record<string, unknown> = {
    model,
    temperature,
    messages,
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

  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error(`Empty LLM response from ${model}`);
  return content;
}

/**
 * Call the OpenRouter chat-completions endpoint with automatic model fallback.
 *
 * Tries the requested model first, then falls back through FREE_FALLBACK_MODELS
 * until one succeeds. Logs each failure for debugging.
 *
 * @param apiKey   – pass `c.env.OPENROUTER_API_KEY` from the route handler
 * @param options  – prompt, model, temperature, etc.
 * @returns        the raw string content of the first choice
 * @throws         only if ALL models in the chain fail
 */
export async function callLLM(apiKey: string, options: LLMOptions): Promise<string> {
  const {
    model = "qwen/qwen3.6-plus:free",
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
 * Call the LLM and parse the JSON response against a Zod schema.
 * Strips markdown code fences before parsing.
 */
export async function callLLMJson<T>(
  apiKey: string,
  options: LLMOptions,
  schema: z.ZodType<T>,
): Promise<T> {
  const raw = await callLLM(apiKey, { ...options, responseFormat: "json_object" });
  const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const parsed = schema.safeParse(JSON.parse(stripped));
  if (!parsed.success) throw new Error(`LLM returned invalid schema: ${parsed.error.message}`);
  return parsed.data;
}

/**
 * Call the OpenRouter chat-completions endpoint with a full messages array.
 * Preferred over callLLM for multi-turn conversations.
 * Includes the same model fallback chain.
 */
export async function callLLMWithMessages(apiKey: string, options: LLMMessagesOptions): Promise<string> {
  const {
    model = "qwen/qwen3.6-plus:free",
    temperature = 0.7,
    messages,
    responseFormat = "text",
  } = options;

  // Build ordered model list: requested model first, then fallbacks (deduped)
  const modelsToTry = [model, ...FREE_FALLBACK_MODELS.filter((m) => m !== model)];
  const errors: string[] = [];

  for (const m of modelsToTry) {
    try {
      return await callOpenRouter(apiKey, m, messages, { temperature, responseFormat });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`[${m}] ${msg}`);
      console.warn(`[ai] Model ${m} failed, trying next...`, msg.slice(0, 150));
    }
  }

  throw new Error(`All LLM models failed:\n${errors.join("\n")}`);
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
  // Free — ordered by quality
  { id: "qwen/qwen3.6-plus:free",                        label: "Qwen 3.6 Plus",         tier: "free",  context: 1_000_000 },
  { id: "nvidia/nemotron-3-super-120b-a12b:free",         label: "Nemotron 120B",          tier: "free",  context: 262_144 },
  { id: "minimax/minimax-m2.5:free",                      label: "MiniMax M2.5",           tier: "free",  context: 196_608 },
  { id: "arcee-ai/trinity-large-preview:free",            label: "Trinity Large",          tier: "free",  context: 131_000 },
  { id: "meta-llama/llama-3.3-70b-instruct:free",         label: "Llama 3.3 70B",          tier: "free",  context: 65_536 },
  { id: "qwen/qwen3-next-80b-a3b-instruct:free",         label: "Qwen 3 80B MoE",         tier: "free",  context: 262_144 },
  { id: "nvidia/nemotron-nano-9b-v2:free",                label: "Nemotron Nano 9B",       tier: "free",  context: 128_000 },
  { id: "google/gemma-3-27b-it:free",                     label: "Gemma 3 27B",            tier: "free",  context: 131_072 },
  { id: "openai/gpt-oss-120b:free",                       label: "GPT OSS 120B",           tier: "free",  context: 131_072 },
  { id: "openrouter/free",                                label: "Auto (best available)",  tier: "free",  context: 200_000 },
  // Paid
  { id: "openai/gpt-4o-mini",                             label: "GPT-4o Mini",            tier: "paid",  context: 128_000 },
  { id: "openai/gpt-4o",                                  label: "GPT-4o",                 tier: "paid",  context: 128_000 },
  { id: "anthropic/claude-3-haiku",                       label: "Claude 3 Haiku",         tier: "paid",  context: 200_000 },
];
