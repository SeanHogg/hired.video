// ai.ts — Centralised OpenRouter LLM helper.
// All routes must use callLLM() instead of fetching OpenRouter directly,
// so the API key is always read from the Cloudflare Worker binding (c.env).

import { z } from "zod";

export interface LLMOptions {
  model?: string;
  temperature?: number;
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

/**
 * Call the OpenRouter chat-completions endpoint.
 *
 * @param apiKey   – pass `c.env.OPENROUTER_API_KEY` from the route handler
 * @param options  – prompt, model, temperature, etc.
 * @returns        the raw string content of the first choice
 * @throws         on non-2xx response or empty content
 */
export async function callLLM(apiKey: string, options: LLMOptions): Promise<string> {
  const {
    model = "google/gemini-flash-1.5",
    temperature = 0.7,
    systemPrompt,
    userMessage,
    responseFormat = "json_object",
  } = options;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://hired.video",
      "X-Title": "hired.video",
    },
    body: JSON.stringify({
      model,
      temperature,
      ...(responseFormat === "json_object" ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  }

  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty LLM response");
  return content;
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
 */
export async function callLLMWithMessages(apiKey: string, options: LLMMessagesOptions): Promise<string> {
  const {
    model = "google/gemini-flash-1.5",
    temperature = 0.7,
    messages,
    responseFormat = "text",
  } = options;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://hired.video",
      "X-Title": "hired.video",
    },
    body: JSON.stringify({
      model,
      temperature,
      ...(responseFormat === "json_object" ? { response_format: { type: "json_object" } } : {}),
      messages,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  }

  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty LLM response");
  return content;
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
