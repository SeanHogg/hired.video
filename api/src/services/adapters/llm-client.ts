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

import { z, toJSONSchema } from "zod";
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

/**
 * A "lenient-ingest" pairing: what the LLM is allowed to emit on the
 * wire, and how to coerce that wire shape into the canonical TS shape
 * the rest of the app uses.
 *
 * Why: free-tier models (qwen, gemma) drift on strict-enum fields —
 * Career 360's `roadmap[N].horizon` saw `"6m"` / `"1y"` / `"4w"` /
 * `"30 days"` instead of the strict `"30d" | "60d" | "90d" | "180d"`,
 * which killed the call across a 3-profile fallback chain even though
 * the underlying intent was fine. This pattern keeps the strict
 * schema in place at the storage / wire boundary while giving the
 * gateway + the LLM a relaxed schema they can actually conform to.
 *
 * Use `defineLenientIngest` so TS infers `Wire` and `Canonical` from
 * the supplied schema + coercion function and you don't have to type
 * them explicitly:
 *
 *   const PlanIngest = defineLenientIngest({
 *     name: "Career360Plan",
 *     ingest: LenientPlanResponseSchema,
 *     coerce: (wire) => ({ ...wire, roadmap: wire.roadmap.map(s => ({
 *       ...s, horizon: normalizeHorizon(s.horizon),
 *     })) }),
 *   });
 *   const result = await client.callJsonLenient(key, opts, PlanIngest);
 *   // result.data is the strict canonical shape.
 */
export interface LenientIngest<Wire, Canonical> {
  /** Stable name for the gateway's strict-mode `json_schema` registration.
   *  Surfaces in `_builderforce.schemaRetries` telemetry so SA can see
   *  which ingest schemas are causing vendor-side conformance retries. */
  name: string;
  /** Lenient Zod schema — what the LLM is expected to produce on the
   *  wire. Wider than canonical: free-form `z.string()` in place of
   *  strict enums where free-tier drift is observed. */
  ingest: z.ZodType<Wire>;
  /** Map a wire value onto the canonical shape. Runs after the lenient
   *  schema validates, so `wire` is fully typed. Should be pure +
   *  total — caller-side normalization, not validation. */
  coerce: (wire: Wire) => Canonical;
}

/** Identity-shaped factory that exists purely so callers can write
 *  `defineLenientIngest({ ... })` and have TypeScript infer `Wire` and
 *  `Canonical` from the supplied schema + coercion function. */
export function defineLenientIngest<Wire, Canonical>(
  spec: LenientIngest<Wire, Canonical>,
): LenientIngest<Wire, Canonical> {
  return spec;
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

// ─── Dispatch diagnostics (the trail callers need to debug 503s) ──────

/** One entry of a gateway-side failover trail — `BuilderforceApiError.failovers`
 *  (SDK ≥0.7). Each entry is one upstream model the gateway tried inside
 *  our single SDK call. Surfaced verbatim so support can detect single-
 *  vendor saturation (e.g. all `openrouter`). */
export interface LLMFailoverEvent {
  model: string;
  /** `openrouter | cerebras | nvidia | ollama` — the upstream that owns the model. */
  vendor: string;
  /** HTTP status the failover attempt returned, or 0 for embedded errors. */
  code: number;
}

/** What the dispatch loop tried for one profile. Captured per attempt
 *  so the support ticket / SA dashboard can answer "why did this 503
 *  happen?" without grepping logs. */
export interface LLMDispatchAttempt {
  /** Vendor-prefixed model id we asked the gateway for. */
  model: string;
  /** Wall-clock duration of this attempt in ms. */
  durationMs: number;
  /** HTTP status the gateway returned (when applicable). */
  status?: number;
  /** Error code from `BuilderforceApiError.code` — e.g. `timeout`,
   *  `rate_limit`, `plan_token_limit_exceeded`, `unknown`. */
  code?: string;
  /** Gateway request id (`x-request-id` header). Quote in support tickets
   *  to correlate with gateway-side logs. */
  requestId?: string;
  /** Truncated error message for human readers. */
  message: string;
  /** Classifier so callers can branch UX on it. */
  kind: "rate_limit" | "timeout" | "auth" | "schema" | "empty" | "network" | "unknown";
  /** Upstream vendor that handled this attempt (`openrouter` / `cerebras` /
   *  `nvidia` / `ollama` / `googleai` / …). Sourced from
   *  `BuilderforceApiError.vendor` (SDK ≥0.8) for dispatch errors, or
   *  `_builderforce.resolvedVendor` from the success response when a
   *  post-success local validator (schema/empty) threw. Unset only for
   *  pre-dispatch failures where no vendor was ever selected (401/403
   *  auth, 400 validation, `plan_token_limit_exceeded`, `claw_token_limit_exceeded`). */
  vendor?: string;
  /** Inner gateway-side cascade attempts that ran inside this single
   *  profile call before the gateway gave up — populated when the
   *  gateway returns `429 cascade_exhausted` with `details.failovers`.
   *  Each entry carries vendor info so SA can spot single-vendor
   *  saturation across the whole chain. */
  failovers?: ReadonlyArray<LLMFailoverEvent>;
}

/** Thrown when the dispatch loop exhausts every profile in the chain
 *  (or the single SA-pinned profile fails). Carries the full per-attempt
 *  trail + a correlation id so routes can produce a diagnostic-rich
 *  503 instead of the previous opaque "AI providers unavailable". */
export class LLMDispatchError extends Error {
  readonly correlationId: string;
  readonly useCase: string;
  readonly attempts: ReadonlyArray<LLMDispatchAttempt>;
  /** Roll-up: if every attempt was the same upstream class, callers can
   *  branch UX (e.g. "rate_limit" → suggest waiting, "schema" → suggest
   *  retrying with different prompt input). `mixed` when classifications
   *  diverge across the chain. */
  readonly classification:
    | "rate_limit"
    | "timeout"
    | "auth"
    | "schema"
    | "empty"
    | "network"
    | "unknown"
    | "mixed";

  constructor(
    useCase: string,
    attempts: ReadonlyArray<LLMDispatchAttempt>,
    correlationId: string,
  ) {
    const summary = attempts
      .map((a) => `[${a.model}] ${a.kind}${a.status ? ` ${a.status}` : ""}: ${a.message.slice(0, 120)}`)
      .join("\n");
    super(
      `All ${attempts.length} profile(s) for use case "${useCase}" failed [correlationId=${correlationId}]:\n${summary}`,
    );
    this.name = "LLMDispatchError";
    this.correlationId = correlationId;
    this.useCase = useCase;
    this.attempts = attempts;
    const kinds = new Set(attempts.map((a) => a.kind));
    this.classification = kinds.size === 1 ? attempts[0].kind : "mixed";
  }
}

/** A 429 `cascade_exhausted` whose underlying upstream error is actually
 *  a vendor schema rejection (most commonly Gemini's `400: The specified
 *  schema produces a constraint that has too many states for serving`)
 *  is NOT a transient rate-limit — retrying never helps. The gateway
 *  surfaces the wrapped upstream message inside the 429's `message`, so
 *  we sniff for the schema signal there and reclassify as `schema`. That
 *  routes the user to an honest `502 AI_INVALID_RESPONSE` ("the AI
 *  couldn't produce a complete response") instead of "providers are at
 *  capacity, retry in a minute" — which is false and sends them down a
 *  dead-end retry loop. See gap #1802 (and #1801 for the root cause that
 *  produces these in the tailor flow). */
export function looksLikeSchemaRejection(message: string): boolean {
  return (
    /too many states/i.test(message) ||
    /schema produces a constraint/i.test(message) ||
    /invalid\s+schema/i.test(message) ||
    /response[_ ]?schema/i.test(message)
  );
}

/** Classify a single attempt's error so the dispatch chain can roll up
 *  to a single classification. Centralised so the JSON-schema vs
 *  rate-limit vs timeout branching never drifts between dispatch and
 *  the route-level error helpers. */
function classifyAttemptError(
  err: unknown,
): {
  kind: LLMDispatchAttempt["kind"];
  status?: number;
  code?: string;
  requestId?: string;
  message: string;
  vendor?: string;
  failovers?: ReadonlyArray<LLMFailoverEvent>;
} {
  if (err instanceof BuilderforceApiError) {
    const status = err.status;
    let kind: LLMDispatchAttempt["kind"] = "unknown";
    if (err.code === "timeout" || status === 408) kind = "timeout";
    else if (status === 401 || status === 403) kind = "auth";
    else if (status === 429 || err.code === "rate_limit" || err.code === "plan_token_limit_exceeded") kind = "rate_limit";
    else if (status >= 500) kind = "network";
    // #1802 — a 429-wrapped cascade (or an opaque error) can be hiding a
    // permanent vendor schema rejection. Reclassify so the rollup +
    // route UX are honest (502 schema, not 503 retry-in-a-minute).
    if ((kind === "rate_limit" || kind === "unknown") && looksLikeSchemaRejection(err.message)) {
      kind = "schema";
    }
    const failovers = err.failovers?.map((f) => ({
      model: f.model,
      vendor: f.vendor,
      code: f.code,
    }));
    // Prefer the SDK's top-level `vendor` (always set on dispatch errors
    // in ≥0.8 — sourced from the gateway's catalog so consumers never
    // parse model ids). Fall back to the last cascade-trail entry only
    // if the SDK ever omits the top-level field (e.g. pre-dispatch errors
    // where no upstream was ever selected — auth, validation, plan-cap).
    const vendor = err.vendor
      ?? (failovers && failovers.length > 0
        ? failovers[failovers.length - 1].vendor
        : undefined);
    return {
      kind,
      status,
      code: err.code,
      requestId: err.requestId,
      message: err.message,
      vendor,
      failovers,
    };
  }
  if (err instanceof Error) {
    if (/invalid schema|JSON\.parse|Unexpected token/i.test(err.message)) {
      return { kind: "schema", message: err.message };
    }
    if (/^Empty response from gateway/i.test(err.message)) {
      return { kind: "empty", message: err.message };
    }
    if (/aborted|abort|timeout/i.test(err.message)) {
      return { kind: "timeout", message: err.message };
    }
    return { kind: "unknown", message: err.message };
  }
  return { kind: "unknown", message: String(err) };
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

/** Rough upper bound on the number of constrained-decoding "states" a
 *  vendor (notably Google AI / Gemini) must compile a strict
 *  `responseSchema` into. Gemini hard-rejects schemas past its internal
 *  ceiling with `400: The specified schema produces a constraint that
 *  has too many states for serving` — a PERMANENT failure, not a
 *  transient one (gap #1801). We approximate the cost by counting every
 *  declared property + enum member across the whole (recursively walked)
 *  schema, including `$defs`, `items`, `additionalProperties`, and
 *  `anyOf`/`oneOf`/`allOf` branches. Cheaper than modelling Gemini's
 *  exact grammar and monotonic in the things that actually blow it up
 *  (lots of properties, long enums, deep nesting). */
export function estimateSchemaStates(node: unknown, depth = 0): number {
  if (depth > 12 || node === null || typeof node !== "object") return 0;
  const obj = node as Record<string, unknown>;
  let count = 0;
  if (Array.isArray(obj.enum)) count += obj.enum.length;
  for (const bagKey of ["properties", "$defs", "definitions"] as const) {
    const bag = obj[bagKey];
    if (bag && typeof bag === "object") {
      for (const child of Object.values(bag as Record<string, unknown>)) {
        count += 1 + estimateSchemaStates(child, depth + 1);
      }
    }
  }
  if (obj.items) count += estimateSchemaStates(obj.items, depth + 1);
  if (obj.additionalProperties && typeof obj.additionalProperties === "object") {
    count += estimateSchemaStates(obj.additionalProperties, depth + 1);
  }
  for (const branchKey of ["anyOf", "oneOf", "allOf"] as const) {
    const branch = obj[branchKey];
    if (Array.isArray(branch)) {
      for (const b of branch) count += estimateSchemaStates(b, depth + 1);
    }
  }
  return count;
}

/** Above this estimated state count we DON'T register the schema as a
 *  strict vendor-side `responseSchema` — we fall back to plain
 *  `json_object` mode and rely on our own post-hoc Zod validation +
 *  retry. Tuned so the full JSON-Resume `ResumeContentSchema` (~170
 *  states — the resume-tailor pipeline) falls back, while the small
 *  enum-bearing schemas that genuinely benefit from vendor conformance
 *  retry (Career360 plan, match insights — under ~20 states) stay
 *  strict. See gap #1801. */
const MAX_STRICT_SCHEMA_STATES = 100;

/** Try to derive a Builderforce-shaped `JsonSchemaSpec` from a Zod
 *  schema so the gateway can run vendor-side `strict: true` conformance
 *  retries. Returns `null` (caller falls back to plain `json_object`
 *  mode) when EITHER:
 *    • the schema can't be translated cleanly (transforms, refinements,
 *      top-level non-object unions) — the gateway only accepts
 *      object-rooted schemas for strict mode; or
 *    • the schema is too complex for vendor constrained-decoding —
 *      Gemini returns a permanent `400 too many states` (gap #1801) that
 *      no fallback model in the chain can absorb once the gateway
 *      cascades into Gemini.
 *  `name` doubles as the schema's id for SA's
 *  `_builderforce.schemaRetries` telemetry. Single source of truth for
 *  both `callJson` and `callJsonLenient` so the two paths can't drift on
 *  whether/when strict mode is safe. */
export function deriveStrictJsonSchema(
  schema: z.ZodType<unknown>,
  name: string,
): JsonSchemaSpec | null {
  try {
    const derived = toJSONSchema(schema) as Record<string, unknown>;
    if (derived?.type !== "object") return null;
    if (estimateSchemaStates(derived) > MAX_STRICT_SCHEMA_STATES) return null;
    return { name, strict: true, schema: derived };
  } catch {
    return null;
  }
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
    const correlationId = `llm-${crypto.randomUUID()}`;
    const attempts: LLMDispatchAttempt[] = [];

    for (let i = 0; i < opts.chain.length; i++) {
      const profile = opts.chain[i];
      const startedAt = Date.now();
      // Per-attempt timeout: caller-supplied wins; otherwise `:free`
      // tier profiles get a tight 25s cap (closes gap #525 part A —
      // free-pool requests that haven't started in ~20s won't finish
      // within 60s either, so a long timeout just inflates the
      // wall-clock the user waits before the chain advances). Paid
      // profiles keep the SDK default 60s.
      const isFreeTier = profile.model.endsWith(":free");
      const perAttemptTimeoutMs =
        opts.callOpts.timeoutMs ?? (isFreeTier ? 25_000 : undefined);
      // Captures `_builderforce.resolvedVendor` after a successful SDK
      // call so the catch block can attribute a post-success local
      // failure (schema/empty validator throw) to the upstream that
      // actually served us. Stays undefined when the SDK call itself
      // throws (BuilderforceApiError carries its own `vendor`).
      let resolvedVendor: string | undefined;
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
          metadata: { ...opts.metadata, correlationId },
          stream: false,
          ...(perAttemptTimeoutMs !== undefined
            ? { timeoutMs: perAttemptTimeoutMs }
            : {}),
          ...(opts.callOpts.signal ? { signal: opts.callOpts.signal } : {}),
          ...(opts.callOpts.idempotencyKey
            ? { idempotencyKey: opts.callOpts.idempotencyKey }
            : {}),
        });

        resolvedVendor = res._builderforce?.resolvedVendor;
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
        // #515 — silent substitution alarm. The gateway docs (SDK 0.4.0)
        // treat `model` as a hint and reserve the right to substitute on
        // cooldown / outage / plan-tier mismatch. For latency-pinned use
        // cases (e.g. `match` requires Cerebras sub-200ms TTFT) a swap to
        // OpenRouter is a 50× latency hit. Log the substitution so SA can
        // dashboard SLA breaches without locking out vendor improvements.
        // Quiet by default — only fires when the gateway actually swapped.
        if (
          usage.model &&
          usage.model !== profile.model &&
          // Don't double-warn the fallback chain we drove — substitution
          // is only the silent gateway-side swap.
          attempts.length === 0
        ) {
          console.warn(
            `[llm-client ${correlationId}] substitution-alarm ${opts.useCase}: ` +
              `requested=${profile.model}, gateway-resolved=${usage.model}. ` +
              `Latency-pinned use cases will see SLA regressions.`,
          );
        }
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
        const cls = classifyAttemptError(err);
        const attempt: LLMDispatchAttempt = {
          model: profile.model,
          durationMs: Date.now() - startedAt,
          ...cls,
          vendor: cls.vendor ?? resolvedVendor,
        };
        attempts.push(attempt);
        if (i < opts.chain.length - 1) {
          console.warn(
            `[llm-client ${correlationId}] ${opts.useCase} ${profile.model} ` +
              `failed (${cls.kind}${cls.status ? ` ${cls.status}` : ""}), ` +
              `falling back to ${opts.chain[i + 1].model}: ${cls.message.slice(0, 150)}`,
          );
        }
      }
    }
    // Every profile in the chain failed. Log the full structured
    // trail at error level so SA can pull it from logs even if the
    // route forgets to surface attempts in its 503 body.
    console.error(`[llm-client ${correlationId}] dispatch exhausted`, {
      useCase: opts.useCase,
      attempts,
    });
    throw new LLMDispatchError(opts.useCase, attempts, correlationId);
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

      // Opportunistically derive a JSON Schema from the supplied Zod
      // schema and ask the gateway for vendor-side `strict: true`
      // conformance retry (Builderforce SDK ≥0.6). When the caller
      // already passed `jsonSchema` explicitly, honour that; otherwise
      // try to derive. Schemas that don't translate cleanly (transforms,
      // refines, top-level z.union with non-object branches, etc.) just
      // fall back to plain `json_object` mode — caller behaviour is
      // unchanged in that case.
      const jsonSchema = safe.jsonSchema ?? deriveStrictJsonSchema(schema, featureKey);

      let parsedData: T | undefined;
      const result = await dispatch({
        chain,
        useCase: safe.useCase,
        messages: [
          { role: "system", content: safe.systemPrompt },
          { role: "user", content: safe.userMessage },
        ],
        responseFormat: pickResponseFormat(
          jsonSchema
            ? { ...safe, jsonSchema }
            : { ...safe, responseFormat: "json_object" },
        ),
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

    async callJsonLenient<Wire, Canonical>(
      featureKey: string,
      options: LLMOptions,
      spec: LenientIngest<Wire, Canonical>,
      opts: LLMCallOpts = {},
    ): Promise<{ data: Canonical; usage: LLMUsage }> {
      await tokenLedger.ensureBudget(user);
      const safe = sa ? options : { ...options, _saOverride: undefined };
      const chain = buildProfileChain(sa, safe.useCase, safe._saOverride);

      // Auto-derive a JSON Schema from the lenient Zod schema so the
      // gateway can run vendor-side `strict: true` conformance retries
      // (Builderforce SDK ≥0.6) on every field EXCEPT the wide-typed
      // ones the lenient schema deliberately allows. We don't pass an
      // explicit `jsonSchema` from the caller — it's derived once here
      // (via the shared guard) so the wire schema and the gateway's
      // enforcement schema can never drift, AND so a schema too complex
      // for vendor constrained-decoding (e.g. the full resume document
      // in `match_tailor`) falls back to plain `json_object` mode
      // instead of triggering Gemini's permanent `400 too many states`
      // (gap #1801). Our post-hoc lenient parse + coerce + retry still
      // guarantees the canonical shape either way.
      const jsonSchema = deriveStrictJsonSchema(spec.ingest, spec.name);

      let coerced: Canonical | undefined;
      const result = await dispatch({
        chain,
        useCase: safe.useCase,
        messages: [
          { role: "system", content: safe.systemPrompt },
          { role: "user", content: safe.userMessage },
        ],
        responseFormat: pickResponseFormat(
          jsonSchema
            ? { ...safe, jsonSchema }
            : { ...safe, responseFormat: "json_object" },
        ),
        metadata: buildMetadata(user, featureKey, opts),
        callOpts: opts,
        validateContent: (content) => {
          // Lenient parse first, then coerce. If coerce throws on a
          // malformed wire value (shouldn't happen — coerce is meant
          // to be total — but free-tier output is unpredictable), the
          // dispatch loop treats it as a model failure and advances
          // to the next profile.
          const wire = parseAndValidateJson(content, spec.ingest);
          coerced = spec.coerce(wire);
        },
      });

      if (coerced === undefined) {
        throw new Error("Gateway returned content without running validator");
      }

      await chargeLedger(user, featureKey, result.usage, opts);
      return { data: coerced, usage: result.usage };
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
    callJsonLenient: err as never,
    callText: err as never,
    callMessages: err as never,
  };
}

/** True when the gateway key is configured. */
export function hasAnyLLMProviderKey(env: LLMEnv | undefined): boolean {
  return Boolean(env?.BUILDERFORCE_API_KEY?.trim());
}
