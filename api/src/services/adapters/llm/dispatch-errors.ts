/**
 * Dispatch diagnostics + failure classification for the LLM port: the
 * per-attempt trail, the chain-exhausted error, and the classifiers that
 * decide whether an attempt failure is transient, schema-shaped, or
 * terminal for the whole profile chain.
 */

import { BuilderforceApiError } from "@seanhogg/builderforce-sdk";

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
  /** Coarse failure class the gateway assigned this attempt (SDK ≥0.8.2):
   *  `rate_limit | timeout | auth | server_error | client_error | network |
   *  skipped`. Structured signal we classify on instead of regex-sniffing
   *  the (often scrubbed) upstream message — a `client_error` cascade is a
   *  deterministic request-shape rejection (e.g. schema too complex), NOT a
   *  transient rate-limit. Undefined on older gateways. Surfaced in the
   *  support payload too. */
  kind?: string;
  /** Wall-clock the gateway spent on this attempt, ms (SDK ≥0.8.2). */
  durationMs?: number;
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
  /** Gateway-minted trace id for this attempt (`error.details.correlationId`,
   *  SDK ≥0.8.2) — the SAME id the gateway returns as `_builderforce.traceId`
   *  on success. This is the AUTHORITATIVE id Builderforce support resolves
   *  server-side (every model attempt, every exception, request/response
   *  bodies); our locally-minted `correlationId` was only ever sent TO the
   *  gateway as request metadata. Unset for pre-dispatch / non-Builderforce
   *  throws. See gap #1810. */
  traceId?: string;
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
 *  is NOT a transient rate-limit — retrying never helps. Text fallback
 *  for older gateways that still inline the wrapped upstream message in
 *  the 429's `message` (newer gateways scrub it — {@link
 *  isRequestShapeCascade} is the structured primary). Reclassifies as
 *  `schema`, which routes the user to an honest `502 AI_INVALID_RESPONSE`
 *  ("the AI
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

/** Structured (text-free) counterpart to {@link looksLikeSchemaRejection},
 *  using the gateway's per-attempt `FailoverEvent.kind` (SDK ≥0.8.2). True
 *  when a cascade exhausted because EVERY concrete upstream attempt
 *  rejected the REQUEST itself (`client_error` / 4xx) and none was an
 *  actual capacity (`rate_limit`) or `timeout` failure — i.e. the failure
 *  is deterministic request-shape (schema too complex, context too long)
 *  and will not resolve by retrying on another model. `skipped` attempts
 *  (never dispatched) are not evidence either way. Preferred over the
 *  message heuristic because the SDK warns upstream error text "is NOT
 *  exposed to callers" on newer gateways. See gap #1802. */
export function isRequestShapeCascade(
  failovers: ReadonlyArray<LLMFailoverEvent> | undefined,
): boolean {
  if (!failovers || failovers.length === 0) return false;
  const concrete = failovers.filter((f) => f.kind && f.kind !== "skipped");
  if (concrete.length === 0) return false;
  return concrete.every((f) => f.kind === "client_error");
}

/** Classify a single attempt's error so the dispatch chain can roll up
 *  to a single classification. Centralised so the JSON-schema vs
 *  rate-limit vs timeout branching never drifts between dispatch and
 *  the route-level error helpers. */
export function classifyAttemptError(
  err: unknown,
): {
  kind: LLMDispatchAttempt["kind"];
  status?: number;
  code?: string;
  requestId?: string;
  traceId?: string;
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
    const failovers = err.failovers?.map((f) => ({
      model: f.model,
      vendor: f.vendor,
      code: f.code,
      kind: f.kind,
      durationMs: f.durationMs,
    }));
    // #1802 — a 429-wrapped cascade (or an opaque error) can be hiding a
    // permanent, request-shape vendor rejection (e.g. Gemini's `400 too
    // many states` schema error): retrying never helps. Prefer the
    // structured failover trail (SDK ≥0.8.2) since upstream text may be
    // scrubbed; fall back to the message heuristic for older gateways
    // that still inline it. Reclassify so the rollup + route UX are
    // honest (502 schema, not 503 retry-in-a-minute).
    if (
      (kind === "rate_limit" || kind === "unknown") &&
      (isRequestShapeCascade(failovers) || looksLikeSchemaRejection(err.message))
    ) {
      kind = "schema";
    }
    // Prefer the SDK's top-level `vendor` (always set on dispatch errors
    // in ≥0.8 — sourced from the gateway's catalog so consumers never
    // parse model ids). Fall back to the last cascade-trail entry only
    // if the SDK ever omits the top-level field (e.g. pre-dispatch errors
    // where no upstream was ever selected — auth, validation, plan-cap).
    const vendor = err.vendor
      ?? (failovers && failovers.length > 0
        ? failovers[failovers.length - 1].vendor
        : undefined);
    // #1810 — the gateway's authoritative trace id lives on the error path
    // as `details.correlationId` (same value it returns as
    // `_builderforce.traceId` on success). Capture it so the dispatch error
    // can quote the id Builderforce support resolves server-side, instead
    // of our locally-minted request-metadata id.
    const traceId = (err.details as { correlationId?: string } | null | undefined)
      ?.correlationId;
    return {
      kind,
      status,
      code: err.code,
      requestId: err.requestId,
      traceId,
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

/** True when every later profile in the chain would fail the same way, so
 *  walking it only burns latency and Worker subrequests:
 *  - the gateway flagged the error terminal (tenant token cap, replay, …);
 *  - a tenant-key 401/403 — rejected before any vendor was selected, and
 *    every profile shares the one key (#2309: 4 identical 401s per call);
 *  - Cloudflare's per-invocation subrequest cap — every later `fetch` in
 *    this invocation throws the same error (#1570).
 *  Vendor 400s are NOT terminal here: a schema one vendor rejects can pass
 *  on the next, which is why the chain exists. */
export function isChainTerminal(err: unknown): boolean {
  if (err instanceof BuilderforceApiError) {
    if (err.terminal) return true;
    return (err.status === 401 || err.status === 403) && err.vendor === undefined;
  }
  return err instanceof Error && /too many subrequests/i.test(err.message);
}
