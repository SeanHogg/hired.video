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
 * Everything that used to live in ai.ts + openai-compat.ts +
 * provider registry is consolidated here. One file, one client.
 */

import type { z } from "zod";
import {
  BuilderforceClient,
  BuilderforceApiError,
  type ChatMessage,
  type ChatCompletionResponse,
  type JsonSchemaSpec,
  type ResponseFormat,
} from "@seanhogg/builderforce-sdk";
import { isSuperAdmin } from "../../middleware/superAdmin.js";
import { tokenLedger } from "../../domains/billing/token-ledger.js";
import type { JwtPayload } from "../../types/index.js";
import {
  resolveProfileChainForUseCase,
  type InferenceProfile,
  type LLMUseCase,
} from "./providers.js";

// ─── Public types (single source — formerly split between ai.ts +
//     openai-compat.ts) ──────────────────────────────────────────────

/**
 * OpenAI-style function-calling tool spec. Forwarded verbatim to the
 * gateway. Re-exported so route code (chat agent, interview practice)
 * doesn't have to know which transport they're going through.
 */
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

/** Function call requested by the model in a multi-turn conversation. */
export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  /** Plain string for text-only messages. (Vision content blocks are
   *  supported by the gateway via `ContentPart[]`, but we keep our
   *  internal API string-only until a vision call site lands.) */
  content: string;
  /** Set on assistant messages that returned tool_calls. Replay
   *  verbatim when continuing a tool-calling conversation. */
  tool_calls?: ToolCall[];
  /** Set on `role: "tool"` messages — id of the assistant tool_call
   *  this message is answering. */
  tool_call_id?: string;
  /** Set on `role: "tool"` messages — function name that produced
   *  this result. Some providers require it. */
  name?: string;
}

export interface LLMOptions {
  /** Required. Drives model + temperature + maxTokens via USE_CASE_PROFILES. */
  useCase: LLMUseCase;
  systemPrompt: string;
  userMessage: string;
  responseFormat?: "json_object" | "text";
  /** When set on a `callJson` call, the gateway runs JSON-schema
   *  conformance retry server-side and surfaces the count via
   *  `_builderforce.schemaRetries`. Caller still gets typed `data`
   *  back via the Zod schema check. */
  jsonSchema?: JsonSchemaSpec;
  /** SA-only override hatch. Stripped for non-SA callers. */
  _saOverride?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
}

export interface LLMMessagesOptions {
  /** Required. Drives model + temperature + maxTokens via USE_CASE_PROFILES. */
  useCase: LLMUseCase;
  messages: LLMMessage[];
  responseFormat?: "json_object" | "text";
  /** Function-calling tool catalog. */
  tools?: ToolSpec[];
  toolChoice?: "auto" | "none" | "required";
  _saOverride?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Model that actually answered. Surfaced via
   *  `_builderforce.resolvedModel`; may differ from the requested
   *  model when the gateway substituted on cooldown / outage. */
  model: string;
}

export interface LLMResult {
  content: string;
  toolCalls: ToolCall[];
  /** `tool_calls` when the model wants tools dispatched, `stop`
   *  otherwise. */
  finishReason: string;
  usage: LLMUsage;
}

export interface LLMCallOpts {
  /** Cross-link the charge to a `tool_runs` row. Optional. */
  toolRunId?: string;
  /** Cross-link the charge to an AI chat session row. Optional. */
  sessionId?: string;
  /** Override who gets billed. Defaults to the user the client was
   *  built with. */
  billedUserId?: string;
  /** Per-call abort signal for user-cancellable generation. */
  signal?: AbortSignal;
  /** Per-call timeout override (ms). */
  timeoutMs?: number;
  /** Idempotency key for cron / scheduled retries. */
  idempotencyKey?: string;
}

export interface LLMEnv {
  BUILDERFORCE_API_KEY?: string;
  BUILDERFORCE_GATEWAY_URL?: string;
}

export interface LLMClient {
  callJson<T>(
    featureKey: string,
    options: LLMOptions,
    schema: z.ZodType<T>,
    opts?: LLMCallOpts,
  ): Promise<{ data: T; usage: LLMUsage }>;
  callText(
    featureKey: string,
    options: LLMOptions,
    opts?: LLMCallOpts,
  ): Promise<{ content: string; usage: LLMUsage }>;
  callMessages(
    featureKey: string,
    options: LLMMessagesOptions,
    opts?: LLMCallOpts,
  ): Promise<LLMResult>;
}

// ─── Private helpers ──────────────────────────────────────────────────

/** Strip leading/trailing markdown code fences a model occasionally
 *  wraps around its JSON output. Belt-and-suspenders even with
 *  `response_format: json_object` — some free-tier models still wrap. */
function stripJsonFences(content: string): string {
  return content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
}

/** Parse + zod-validate a JSON string. Throws on parse / schema fail
 *  so the dispatch loop can advance to the next profile. */
function parseAndValidateJson<T>(content: string, schema: z.ZodType<T>): T {
  const stripped = stripJsonFences(content);
  const obj = JSON.parse(stripped);
  const parsed = schema.safeParse(obj);
  if (!parsed.success) {
    throw new Error(`LLM returned invalid schema: ${parsed.error.message}`);
  }
  return parsed.data;
}

/**
 * Resolve the ordered profile chain for a use case, honoring SA
 * override (when present and the caller is SA). SA override collapses
 * the chain to a single profile so SA test failures aren't masked by
 * cross-provider fallback.
 */
function buildProfileChain(
  sa: boolean,
  useCase: LLMUseCase,
  override:
    | { model?: string; temperature?: number; maxTokens?: number }
    | undefined,
): InferenceProfile[] {
  if (sa && override) {
    const base = resolveProfileChainForUseCase(useCase)[0];
    return [
      {
        model: override.model ?? base.model,
        temperature: override.temperature ?? base.temperature,
        maxTokens: override.maxTokens ?? base.maxTokens,
      },
    ];
  }
  return resolveProfileChainForUseCase(useCase);
}

/**
 * Charge the token-ledger after a successful LLM call. Fire-and-forget
 * — billing failures must NEVER fail an otherwise-successful AI
 * response.
 */
async function chargeLedger(
  user: JwtPayload | null | undefined,
  featureKey: string,
  usage: LLMUsage | undefined,
  opts: LLMCallOpts,
): Promise<void> {
  const billedUserId = opts.billedUserId ?? user?.sub;
  if (!billedUserId || !usage || usage.totalTokens <= 0) return;
  try {
    await tokenLedger.charge({
      userId: billedUserId,
      featureKey,
      usage,
      toolRunId: opts.toolRunId,
      sessionId: opts.sessionId,
    });
  } catch (err) {
    console.warn(`[llm-client] charge failed for ${billedUserId}/${featureKey}:`, err);
  }
}

function normalizeUsage(
  raw: ChatCompletionResponse["usage"],
  requestedModel: string,
  resolvedModel: string | undefined,
): LLMUsage {
  return {
    promptTokens: raw?.prompt_tokens ?? 0,
    completionTokens: raw?.completion_tokens ?? 0,
    totalTokens: raw?.total_tokens ?? 0,
    model: resolvedModel ?? requestedModel,
  };
}

/**
 * Build the metadata the gateway will persist on `llm_usage_log` and
 * echo back on `_builderforce.metadata`. Always includes `featureKey`
 * for SA dashboards; optional `toolRunId` / `sessionId` / `userId`
 * for forensic billing trace-back. Single source so every call site
 * sends consistent shape.
 */
function buildMetadata(
  user: JwtPayload | null | undefined,
  featureKey: string,
  opts: LLMCallOpts,
): Record<string, string> {
  const md: Record<string, string> = { featureKey };
  const billedUserId = opts.billedUserId ?? user?.sub;
  if (billedUserId) md.userId = billedUserId;
  if (opts.toolRunId) md.toolRunId = opts.toolRunId;
  if (opts.sessionId) md.sessionId = opts.sessionId;
  return md;
}

/** Build the `response_format` value the gateway expects. JSON-mode
 *  callers pass `responseFormat: "json_object"` (loose) or
 *  `jsonSchema` (strict, gateway retries on schema-fail). Text-mode
 *  callers omit response_format entirely. */
function pickResponseFormat(
  opts: { responseFormat?: "json_object" | "text"; jsonSchema?: JsonSchemaSpec },
): ResponseFormat | undefined {
  if (opts.jsonSchema) {
    return { type: "json_schema", json_schema: opts.jsonSchema };
  }
  if (opts.responseFormat === "json_object") {
    return { type: "json_object" };
  }
  if (opts.responseFormat === "text") {
    return { type: "text" };
  }
  return undefined;
}

// ─── Factory ──────────────────────────────────────────────────────────

/**
 * Build the LLM facade. One implementation, backed by Builderforce.
 * Routes call this exactly the same way as before; nothing else
 * changes from a route-handler's perspective.
 */
export function createLLMClient(
  env: LLMEnv | undefined,
  user: JwtPayload | null | undefined,
): LLMClient {
  const apiKey = env?.BUILDERFORCE_API_KEY?.trim();
  if (!apiKey) {
    return createNoKeyLLMClient();
  }
  const sdk = new BuilderforceClient({
    apiKey,
    baseUrl: env?.BUILDERFORCE_GATEWAY_URL,
    // Default 60s; per-call override via LLMCallOpts.timeoutMs.
    timeoutMs: 60_000,
  });

  const sa = isSuperAdmin(user);

  /**
   * Walk the use case's profile chain via the SDK. Each profile is
   * one independent gateway request; failures advance the chain. The
   * gateway's own internal retry is opaque to us (surfaced via
   * `_builderforce.retries` on the response we ultimately return).
   *
   * `validateContent` is an optional post-success check for JSON-mode
   * callers. When supplied, a parse / schema failure is treated as a
   * model failure and the loop advances to the next profile.
   */
  async function dispatch(opts: {
    chain: InferenceProfile[];
    useCase: LLMUseCase;
    messages: ChatMessage[];
    responseFormat?: ResponseFormat;
    tools?: LLMMessagesOptions["tools"];
    toolChoice?: LLMMessagesOptions["toolChoice"];
    metadata: Record<string, string>;
    callOpts: LLMCallOpts;
    validateContent?: (content: string) => void;
  }): Promise<LLMResult> {
    const errors: string[] = [];

    for (let i = 0; i < opts.chain.length; i++) {
      const profile = opts.chain[i];
      try {
        const res = await sdk.chat.completions.create({
          model: profile.model,
          messages: opts.messages,
          temperature: profile.temperature,
          ...(profile.maxTokens ? { max_tokens: profile.maxTokens } : {}),
          ...(opts.responseFormat ? { response_format: opts.responseFormat } : {}),
          ...(opts.tools && opts.tools.length > 0
            ? { tools: opts.tools, tool_choice: opts.toolChoice ?? "auto" }
            : {}),
          useCase: opts.useCase,
          metadata: opts.metadata,
          stream: false,
          ...(opts.callOpts.timeoutMs !== undefined
            ? { timeoutMs: opts.callOpts.timeoutMs }
            : {}),
          ...(opts.callOpts.signal ? { signal: opts.callOpts.signal } : {}),
          ...(opts.callOpts.idempotencyKey
            ? { idempotencyKey: opts.callOpts.idempotencyKey }
            : {}),
        });

        const choice = res.choices?.[0];
        const message = choice?.message;
        const content = typeof message?.content === "string" ? message.content : "";
        const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];

        // A response is valid if EITHER it has prose OR it requested tools.
        if (!content && toolCalls.length === 0) {
          throw new Error(`Empty response from gateway for model ${profile.model}`);
        }

        if (opts.validateContent && content) {
          opts.validateContent(content);
        }

        const usage = normalizeUsage(
          res.usage,
          profile.model,
          res._builderforce?.resolvedModel ?? res.model,
        );
        const finishReason =
          choice?.finish_reason ?? (toolCalls.length > 0 ? "tool_calls" : "stop");

        return {
          content,
          toolCalls: toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: { name: tc.function.name, arguments: tc.function.arguments },
          })),
          finishReason,
          usage,
        };
      } catch (err) {
        const msg =
          err instanceof BuilderforceApiError
            ? `[${err.status}/${err.code ?? "unknown"}] ${err.message}`
            : err instanceof Error
              ? err.message
              : String(err);
        errors.push(`[${profile.model}] ${msg}`);
        if (i < opts.chain.length - 1) {
          console.warn(
            `[llm-client] ${opts.useCase} ${profile.model} failed, ` +
              `falling back to ${opts.chain[i + 1].model}: ${msg.slice(0, 150)}`,
          );
        }
      }
    }
    throw new Error(
      `All ${opts.chain.length} profile(s) for use case "${opts.useCase}" failed:\n${errors.join("\n")}`,
    );
  }

  return {
    async callJson<T>(
      featureKey: string,
      options: LLMOptions,
      schema: z.ZodType<T>,
      opts: LLMCallOpts = {},
    ): Promise<{ data: T; usage: LLMUsage }> {
      await tokenLedger.ensureBudget(user);
      const safe = sa ? options : { ...options, _saOverride: undefined };
      const chain = buildProfileChain(sa, safe.useCase, safe._saOverride);

      let parsedData: T | undefined;
      const result = await dispatch({
        chain,
        useCase: safe.useCase,
        messages: [
          { role: "system", content: safe.systemPrompt },
          { role: "user", content: safe.userMessage },
        ],
        responseFormat: pickResponseFormat({ ...safe, responseFormat: "json_object" }),
        metadata: buildMetadata(user, featureKey, opts),
        callOpts: opts,
        validateContent: (content) => {
          parsedData = parseAndValidateJson(content, schema);
        },
      });

      if (parsedData === undefined) {
        throw new Error("Gateway returned content without running validator");
      }

      await chargeLedger(user, featureKey, result.usage, opts);
      return { data: parsedData, usage: result.usage };
    },

    async callText(
      featureKey: string,
      options: LLMOptions,
      opts: LLMCallOpts = {},
    ): Promise<{ content: string; usage: LLMUsage }> {
      await tokenLedger.ensureBudget(user);
      const safe = sa ? options : { ...options, _saOverride: undefined };
      const chain = buildProfileChain(sa, safe.useCase, safe._saOverride);

      const result = await dispatch({
        chain,
        useCase: safe.useCase,
        messages: [
          { role: "system", content: safe.systemPrompt },
          { role: "user", content: safe.userMessage },
        ],
        responseFormat: pickResponseFormat({ ...safe, responseFormat: "text" }),
        metadata: buildMetadata(user, featureKey, opts),
        callOpts: opts,
      });

      await chargeLedger(user, featureKey, result.usage, opts);
      return { content: result.content, usage: result.usage };
    },

    async callMessages(
      featureKey: string,
      options: LLMMessagesOptions,
      opts: LLMCallOpts = {},
    ): Promise<LLMResult> {
      await tokenLedger.ensureBudget(user);
      const safe = sa ? options : { ...options, _saOverride: undefined };
      const chain = buildProfileChain(sa, safe.useCase, safe._saOverride);

      // Translate our LLMMessage shape to SDK ChatMessage. Our messages
      // always carry string content; the SDK's `string | ContentPart[]
      // | null` is wider but we don't use vision content blocks yet.
      const sdkMessages: ChatMessage[] = safe.messages.map((m) => {
        const out: ChatMessage = { role: m.role, content: m.content };
        if (m.tool_calls) out.tool_calls = m.tool_calls;
        if (m.tool_call_id) out.tool_call_id = m.tool_call_id;
        if (m.name) out.name = m.name;
        return out;
      });

      const result = await dispatch({
        chain,
        useCase: safe.useCase,
        messages: sdkMessages,
        responseFormat: pickResponseFormat({ responseFormat: safe.responseFormat ?? "text" }),
        tools: safe.tools,
        toolChoice: safe.toolChoice,
        metadata: buildMetadata(user, featureKey, opts),
        callOpts: opts,
      });

      await chargeLedger(user, featureKey, result.usage, opts);
      return result;
    },
  };
}

/**
 * No-op client used when no gateway key is configured. Both methods
 * reject — routes are expected to catch and fall through to the
 * keyword-overlap path.
 */
export function createNoKeyLLMClient(): LLMClient {
  const err = () =>
    Promise.reject(new Error("LLM unavailable: BUILDERFORCE_API_KEY not configured"));
  return {
    callJson: err as never,
    callText: err as never,
    callMessages: err as never,
  };
}

/** True when the gateway key is configured. */
export function hasAnyLLMProviderKey(env: LLMEnv | undefined): boolean {
  return Boolean(env?.BUILDERFORCE_API_KEY?.trim());
}
