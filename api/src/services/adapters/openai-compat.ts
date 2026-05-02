/**
 * Shared HTTP helper for OpenAI-compatible chat-completions endpoints.
 *
 * Every vendor we use (OpenRouter, Cerebras, and any future addition like
 * Together / Groq / DeepInfra) speaks the same wire format: POST to a
 * `/chat/completions` URL with a Bearer token, get back `{choices, usage}`.
 * Pulling that one shape into a single function means:
 *   - One place to fix when a vendor returns a malformed `usage` block.
 *   - One place to set the per-request timeout, JSON-mode flag, etc.
 *   - Adding a vendor is a registry entry, not a parallel implementation.
 *
 * This is internal. Routes don't call this directly — they go through the
 * `LLMClient` port (llm-client.ts) or the legacy helpers in ai.ts.
 */

import type { ProviderConfig } from "./providers.js";

export interface CallProviderResult {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    /** Model the vendor reports actually answered. */
    model: string;
  };
}

export interface CallProviderOptions {
  temperature?: number;
  responseFormat?: "json_object" | "text";
  maxTokens?: number;
}

/**
 * Single chat-completions call against one provider + one model. Used by
 * the fallback-chain loop in ai.ts; do NOT call from route code.
 *
 * Throws on HTTP error or empty response so the outer loop can move on
 * to the next model in the chain.
 */
export async function callOpenAICompatProvider(
  provider: ProviderConfig,
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  options: CallProviderOptions = {},
): Promise<CallProviderResult> {
  const { temperature = 0.7, responseFormat = "json_object", maxTokens } = options;

  const body: Record<string, unknown> = {
    model,
    temperature,
    messages,
    // Always ask for usage so token billing is accurate. OpenRouter honors
    // this via `usage: {include: true}`; Cerebras returns usage by default
    // but accepts the field without complaining, so we send it everywhere.
    usage: { include: true },
  };
  if (responseFormat === "json_object") {
    body.response_format = { type: "json_object" };
  }
  if (maxTokens) {
    body.max_tokens = maxTokens;
  }

  const res = await fetch(provider.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(provider.headers ?? {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(provider.timeoutMs),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`${provider.label} ${res.status} [${model}]: ${errBody.slice(0, 200)}`);
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
  if (!content) throw new Error(`Empty LLM response from ${provider.label}/${model}`);

  // Prefer the vendor's reported usage. Fall back to a coarse char/4
  // estimate for the rare model that doesn't include it.
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
