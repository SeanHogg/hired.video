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

/** OpenAI-compat tool spec, forwarded verbatim to the provider. The shape
 *  is identical for OpenRouter, OpenAI, and Anthropic's OpenAI-compatible
 *  endpoint, so we don't translate per vendor. */
export interface ToolSpec {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
      additionalProperties?: boolean;
    };
  };
}

/** A function call requested by the model. The route hands these to the
 *  client (or to a server-side dispatcher) and feeds back a `tool` message
 *  on the next turn. */
export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface CallProviderResult {
  content: string;
  /** Present when the model asked to call one or more tools instead of (or
   *  in addition to) returning prose. Empty when no tools were called. */
  toolCalls: ToolCall[];
  /** Reason the model stopped — `tool_calls` means "I want to call tools",
   *  `stop` means a normal completion. Echoed back to the caller so the
   *  outer loop can decide whether to dispatch + recurse. */
  finishReason: string;
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
  /** Function-calling tools the model may invoke. Omit to disable tool
   *  calling for this request. */
  tools?: ToolSpec[];
  /** OpenAI-style `tool_choice`. `"auto"` (default when tools are present)
   *  lets the model decide; `"none"` forces a text answer. Omitted when
   *  there are no tools. */
  toolChoice?: "auto" | "none" | "required";
}

/**
 * Single chat-completions call against one provider + one model. Used by
 * the fallback-chain loop in ai.ts; do NOT call from route code.
 *
 * Throws on HTTP error or empty response so the outer loop can move on
 * to the next model in the chain.
 */
/** Extended message shape that supports tool-call turns. Plain `content`
 *  messages still work — `tool_calls` and `tool_call_id` are added so the
 *  caller can replay assistant→tool-call→tool-result→assistant rounds. */
export interface CompatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Set on assistant messages that asked to call tools. */
  tool_calls?: ToolCall[];
  /** Set on `role: "tool"` messages, matching the assistant's call id. */
  tool_call_id?: string;
  /** Set on `role: "tool"` messages so the model knows which tool answered. */
  name?: string;
}

export async function callOpenAICompatProvider(
  provider: ProviderConfig,
  apiKey: string,
  model: string,
  messages: Array<CompatMessage | { role: string; content: string }>,
  options: CallProviderOptions = {},
): Promise<CallProviderResult> {
  const {
    temperature = 0.7,
    responseFormat = "json_object",
    maxTokens,
    tools,
    toolChoice,
  } = options;

  const body: Record<string, unknown> = {
    model,
    temperature,
    messages,
    // Always ask for usage so token billing is accurate. OpenRouter honors
    // this via `usage: {include: true}`; Cerebras returns usage by default
    // but accepts the field without complaining, so we send it everywhere.
    usage: { include: true },
  };
  // Tool calling is mutually exclusive with json_object response format on
  // most providers — when tools are passed, the model may either return
  // text OR a tool_calls array, so leave response_format unset.
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = toolChoice ?? "auto";
  } else if (responseFormat === "json_object") {
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
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: ToolCall[];
      };
      finish_reason?: string;
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
    model?: string;
  };
  const choice = json.choices?.[0];
  const content = choice?.message?.content ?? "";
  const toolCalls = Array.isArray(choice?.message?.tool_calls) ? choice!.message!.tool_calls! : [];
  const finishReason = choice?.finish_reason ?? (toolCalls.length > 0 ? "tool_calls" : "stop");

  // A response is valid if EITHER it has prose OR it requested tools.
  if (!content && toolCalls.length === 0) {
    throw new Error(`Empty LLM response from ${provider.label}/${model}`);
  }

  // Prefer the vendor's reported usage. Fall back to a coarse char/4
  // estimate for the rare model that doesn't include it.
  const promptTokens =
    json.usage?.prompt_tokens ??
    Math.round(messages.reduce((acc, m) => acc + (m.content?.length ?? 0), 0) / 4);
  const completionTokens =
    json.usage?.completion_tokens ?? Math.round(content.length / 4);
  const totalTokens =
    json.usage?.total_tokens ?? promptTokens + completionTokens;

  return {
    content,
    toolCalls,
    finishReason,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens,
      model: json.model ?? model,
    },
  };
}
