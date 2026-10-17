/**
 * Public types of the LLM port (formerly inlined in llm-client.ts, which
 * re-exports everything here). Route code imports these via the
 * llm-client.ts facade.
 */

import type { z } from "zod";
import type { ContentPart, JsonSchemaSpec } from "@seanhogg/builderforce-sdk";
import type { LLMUseCase } from "../providers.js";
import type { LLMStreamSink } from "../llm-stream.js";
import type { LenientIngest } from "./json-schema.js";

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

/** Vision/multimodal content block. Re-exported from the gateway SDK so
 *  call sites (resume image OCR, future vision features) can build
 *  `image_url` parts without importing the SDK directly. A `ContentPart[]`
 *  message mixes `{ type: "text" }` and `{ type: "image_url" }` blocks. */
export type LLMContentPart = ContentPart;

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  /** Plain string for text-only messages, or `ContentPart[]` for vision
   *  (text + image_url blocks). The first vision call site is resume image
   *  OCR (`callMessages` with `useCase: "resume_ocr"`). */
  content: string | LLMContentPart[];
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
   *  model when the gateway substituted on cooldown / outage.
   *  SA-only telemetry — never echo to consumers (use `toClientUsage`). */
  model: string;
  /** The model HINT we asked the gateway for on this attempt (the profile
   *  model). Carried alongside the resolved `model` so the charge path can
   *  detect silent gateway-side substitution (`model !== requestedModel`)
   *  and stamp it onto the queryable usage-ledger metadata — gap #515.
   *  SA-only telemetry; never echoed to consumers (`toClientUsage` strips it). */
  requestedModel?: string;
  /** Gateway trace id (`llm-…`) for this call — `_builderforce.traceId`
   *  (Builderforce SDK ≥0.8.1). The ONLY diagnostic identifier safe to
   *  surface to consumers: quoting it to Builderforce support pulls up
   *  full server-side diagnostics (every model attempt, every exception,
   *  request/response bodies) while the detail itself stays builder-side.
   *  Undefined for the no-key mock path and older gateway responses. */
  traceId?: string;
  /** How many vendor-side `json_schema` conformance retries the gateway
   *  performed for this call (`_builderforce.schemaRetries`, Builderforce
   *  SDK ≥0.8). Strict-mode (`response_format: json_schema`) calls whose
   *  first vendor response failed the schema get re-asked server-side; a
   *  high count for a feature means that feature is burning gateway budget
   *  conforming to its strict schema. SA-only telemetry — NOT projected to
   *  consumers (`toClientUsage` strips it). Undefined when the call wasn't
   *  strict-mode, didn't retry, or ran on an older gateway. See gap #2159. */
  schemaRetries?: number;
}

/** Consumer-facing projection of {@link LLMUsage}. Token counts plus the
 *  gateway `traceId` — and deliberately NOT `model`/vendor, which is
 *  SuperAdmin-only telemetry that must never leak to end users. Single
 *  source of truth for "what usage fields an API response may echo back",
 *  so every route applies the same privacy rule and the same traceId
 *  field instead of hand-spreading `usage` (which leaks `model`). */
export interface ClientUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Gateway trace id (`llm-…`). Quote to support for full diagnostics. */
  traceId?: string;
}

/** Map an internal {@link LLMUsage} to the consumer-safe {@link ClientUsage}
 *  shape. Strips `model` (SA-only) and carries `traceId` through. Use this
 *  at every route that returns usage to a client — never spread `usage`
 *  directly. */
export function toClientUsage(usage: LLMUsage): ClientUsage {
  return {
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    ...(usage.traceId ? { traceId: usage.traceId } : {}),
  };
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
  /** Opt out of the prompt-safety screen. Set ONLY by trusted internal
   *  calls that legitimately pass flagged text — e.g. the moderation
   *  content scanner, which is fed the very content it must classify and
   *  would otherwise block itself. Defaults to false: every other call
   *  is screened. */
  skipContentGuard?: boolean;
  /** A call the product gives away (the cover-letter Tone rewrite): no
   *  budget gate before it, and the charge only AUDITS it (ai_usage_records,
   *  source "free") — never debits an allowance or pack. Callers must rate-
   *  limit the route themselves since the budget no longer bounds it. */
  exempt?: boolean;
  /** Stream the answer as it is generated (#1342, llm-stream.ts): each text
   *  delta goes to `stream.onDelta`; `stream.onReset` fires when an attempt
   *  that already streamed fails and the chain moves on. Same chain,
   *  short-circuit, validation and charge as the one-shot call. Ignored for
   *  tool-calling requests (tool-call deltas are not streamed). */
  stream?: LLMStreamSink;
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
  /**
   * Same surface as `callJson` but takes a `LenientIngest` pairing
   * instead of a single Zod schema. The gateway gets the lenient
   * schema as a strict `json_schema` for vendor-side conformance retry
   * (Builderforce SDK ≥0.6); we run the coerce step on the validated
   * wire value to produce the canonical shape. Use whenever a strict
   * enum has shown free-tier drift in production (current call site:
   * Career 360 plan, see Gap #532).
   */
  callJsonLenient<Wire, Canonical>(
    featureKey: string,
    options: LLMOptions,
    spec: LenientIngest<Wire, Canonical>,
    opts?: LLMCallOpts,
  ): Promise<{ data: Canonical; usage: LLMUsage }>;
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
