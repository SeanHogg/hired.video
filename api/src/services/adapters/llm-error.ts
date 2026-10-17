/**
 * Shared error-shaping helpers for routes that catch `LLMDispatchError`
 * from the LLM facade.
 *
 * Why this exists: every route that calls `llm.callJson(...)` /
 * `llm.callText(...)` had its own ad-hoc `aiFailure(err, c)` helper
 * that returned a generic 503. Support tickets came in with no
 * diagnostic detail beyond "AI providers are temporarily unavailable",
 * leaving SA unable to answer "which model failed? rate-limited?
 * gateway requestId?" without grepping logs by timestamp.
 *
 * This helper extracts the structured `LLMDispatchAttempt` trail the
 * dispatch loop captured, classifies the failure, and produces a
 * consistent payload routes can attach to their 503 response so the
 * support ticket carries the full diagnostic context the user needs
 * to file (and SA needs to investigate).
 *
 * Vendor identity (model strings, gateway requestIds) is OK to surface
 * to authenticated users — the principle "vendor identity is invisible
 * to end users" applies to UNSOLICITED disclosure (the chat UI never
 * shows "powered by Claude"). When the user opens a support ticket
 * they're explicitly asking for diagnostic context, so quoting the
 * correlationId / model / gateway requestId is the right level of
 * disclosure. We DO redact for non-authenticated public surfaces (no
 * such surfaces use the LLM today).
 */

import type { Context } from "hono";
import {
  LLMDispatchError,
  type LLMDispatchAttempt,
  type LLMFailoverEvent,
} from "./llm/dispatch-errors.js";
import { error } from "../../types/index.js";
import { logger } from "../../lib/logger.js";

export { LLMDispatchError } from "./llm/dispatch-errors.js";
export type { LLMDispatchAttempt, LLMFailoverEvent } from "./llm/dispatch-errors.js";

// Per-attempt message cap surfaced in the support-ticket payload. Wide
// enough to carry a multi-error Zod validation message (5+ field
// failures with their full `path` + emitted value) so SA can diagnose
// the actual upstream error without round-tripping for logs. Bumping
// this is what closes gap #527 — earlier 500-char limit truncated the
// `invalid_value` payload before the offending category value was
// visible. Still bounded so a runaway error message can't bloat the
// 502 response body.
const MAX_ATTEMPT_MESSAGE_CHARS = 4000;

/** One attempt entry surfaced in the support-ticket payload. Single
 *  source of truth for the attempt shape so `lastAttempt` and the
 *  `attempts[]` trail stay in sync (lastAttempt just omits durationMs
 *  since it's the same as the final attempts entry's). */
export interface LLMErrorAttempt {
  model: string;
  durationMs: number;
  kind: LLMDispatchAttempt["kind"];
  status?: number;
  code?: string;
  requestId?: string;
  /** Gateway-minted trace id for THIS attempt (`details.correlationId`).
   *  Each profile is a separate gateway call with its own trace, so the
   *  per-attempt id lets support resolve any single hop server-side, not
   *  just the terminal one carried on the top-level `correlationId`. See
   *  gap #1810. */
  traceId?: string;
  message: string;
  /** Upstream vendor that handled this attempt (openrouter / cerebras /
   *  nvidia / ollama / googleai / …). See `LLMDispatchAttempt.vendor`
   *  for resolution rules — sourced from the SDK so undefined ONLY for
   *  pre-dispatch errors where no upstream was ever selected (auth,
   *  validation, plan-cap). Surfaced so support can spot single-vendor
   *  saturation without grepping logs. */
  vendor?: string;
  /** Gateway-side cascade trail for this single profile call when
   *  `429 cascade_exhausted` was returned. Each entry carries vendor +
   *  status. */
  failovers?: ReadonlyArray<LLMFailoverEvent>;
}

/** What every error-surface should attach to its 503 body so the user
 *  can quote a correlationId in support and SA can pull the matching
 *  log line + reconcile against the gateway's request-id index. */
export interface LLMErrorPayload {
  /** Stable id printed alongside every console.error line for this
   *  dispatch — quote in support tickets. */
  correlationId: string;
  /** Roll-up classification: `rate_limit` / `timeout` / `auth` /
   *  `schema` / `empty` / `network` / `unknown` / `mixed`. */
  classification: LLMDispatchError["classification"];
  /** How many profiles in the chain were tried before giving up. */
  attemptCount: number;
  /** Last attempt's classifier string + truncated message — gives the
   *  ticket reader a one-glance "what was the actual upstream error". */
  lastAttempt: Omit<LLMErrorAttempt, "durationMs"> | null;
  /** Per-attempt trail. Always included so support tickets carry full
   *  context — vendor identity disclosure is fine here (see file
   *  header for rationale). Omit at the route level if you ever route
   *  this through a public/unauthenticated surface. */
  attempts: ReadonlyArray<LLMErrorAttempt>;
}

/** Pull the structured fields out of an `LLMDispatchError` (returns
 *  null for any other error). The truthiness check is the seam that
 *  keeps non-LLM failures (e.g. `USER_NOT_FOUND`, validation errors)
 *  on their own error paths instead of getting wrapped as AI failures.
 */
export function summarizeDispatchError(err: unknown): LLMErrorPayload | null {
  if (!(err instanceof LLMDispatchError)) return null;
  const last = err.attempts[err.attempts.length - 1] ?? null;
  return {
    correlationId: err.correlationId,
    classification: err.classification,
    attemptCount: err.attempts.length,
    lastAttempt: last
      ? {
          model: last.model,
          kind: last.kind,
          status: last.status,
          code: last.code,
          requestId: last.requestId,
          traceId: last.traceId,
          message: last.message.slice(0, MAX_ATTEMPT_MESSAGE_CHARS),
          vendor: last.vendor,
          failovers: last.failovers,
        }
      : null,
    attempts: err.attempts.map((a) => ({
      model: a.model,
      durationMs: a.durationMs,
      kind: a.kind,
      status: a.status,
      code: a.code,
      requestId: a.requestId,
      traceId: a.traceId,
      message: a.message.slice(0, MAX_ATTEMPT_MESSAGE_CHARS),
      vendor: a.vendor,
      failovers: a.failovers,
    })),
  };
}

/** HTTP error envelope routes can spread into `c.json(...)`. Mirrors
 *  the existing `error()` helper shape but adds the diagnostic body
 *  for AI failures. Single source of "what does an AI 503 look like"
 *  so career360 / profile-audit / vendor-sync / studio cannot drift.
 *
 *  `AI_USAGE_LIMIT_REACHED` (429) is the upgrade-prompt path — used
 *  when the gateway refuses our calls because OUR Builderforce vendor
 *  plan is exhausted (`plan_token_limit_exceeded`). Routed through the
 *  same code the per-user TOKEN_BUDGET_EXCEEDED middleware uses so the
 *  frontend renders the existing inline upgrade banner instead of a
 *  red error toast. The end user has nothing to do with the vendor's
 *  daily quota; the right surface is "upgrade to keep using AI",
 *  not "providers are at capacity". */
export interface AIErrorEnvelope {
  status: 429 | 502 | 503;
  code:
    | "AI_UNAVAILABLE"
    | "AI_INVALID_RESPONSE"
    | "AI_RATE_LIMITED"
    | "AI_AUTH_FAILED"
    | "AI_USAGE_LIMIT_REACHED";
  message: string;
  payload: LLMErrorPayload;
}

/** Detect whether the dispatch failed because OUR Builderforce vendor
 *  plan is exhausted (gateway returns 429 + `plan_token_limit_exceeded`).
 *  When ANY attempt in the chain hit this code, the chain didn't
 *  exhaust because of model failures — it exhausted because the
 *  gateway is hard-gating us. The right UX is an upgrade prompt, not
 *  "AI is at capacity". */
function isVendorPlanExhausted(payload: LLMErrorPayload): boolean {
  return payload.attempts.some((a) => a.code === "plan_token_limit_exceeded");
}

/** Map a `LLMDispatchError` to the right HTTP code + user-facing
 *  message based on the classifier. Returns null if `err` isn't a
 *  dispatch error — caller continues their existing error path. */
export function buildAIErrorEnvelope(err: unknown): AIErrorEnvelope | null {
  const payload = summarizeDispatchError(err);
  if (!payload) return null;

  // Vendor plan exhausted — pre-empt the rate_limit branch so the
  // user gets an upgrade CTA instead of a generic "providers are at
  // capacity" toast. See type-doc above for rationale.
  if (isVendorPlanExhausted(payload)) {
    return {
      status: 429,
      code: "AI_USAGE_LIMIT_REACHED",
      message:
        "You've reached the AI usage limit on your current plan. Upgrade to keep using AI tools.",
      payload,
    };
  }

  switch (payload.classification) {
    case "schema":
    case "empty":
      return {
        status: 502,
        code: "AI_INVALID_RESPONSE",
        message:
          "The AI couldn't produce a complete response — please try again in a moment.",
        payload,
      };
    case "rate_limit":
      return {
        status: 503,
        code: "AI_RATE_LIMITED",
        message:
          "AI providers are at capacity right now. Please retry in a minute or two.",
        payload,
      };
    case "auth":
      return {
        status: 503,
        code: "AI_AUTH_FAILED",
        message:
          "AI gateway rejected our credentials. Engineering has been notified — please try again shortly.",
        payload,
      };
    case "timeout":
    case "network":
    case "unknown":
    case "mixed":
    default:
      return {
        status: 503,
        code: "AI_UNAVAILABLE",
        message:
          "AI providers are temporarily unavailable. Please try again in a minute.",
        payload,
      };
  }
}

/** Generic fallback message + code used when `err` is NOT an
 *  `LLMDispatchError` (so no structured trail to surface) but the route
 *  still wants to report an AI failure. */
const GENERIC_AI_FAILURE = {
  code: "AI_UNAVAILABLE",
  message:
    "AI providers are temporarily unavailable. Please try again in a minute.",
  status: 503 as const,
};

/**
 * THE single seam every LLM-bound route uses in its `catch` block so the
 * try/catch error shape can never drift between routes (gaps #519/#529).
 *
 * It runs `buildAIErrorEnvelope(err)`:
 *  - matched (an `LLMDispatchError`) → returns the typed AI envelope JSON
 *    with the correct HTTP code (429 upgrade / 502 / 503) AND the
 *    diagnostic `payload` attached under `error.details`. That payload
 *    carries the `correlationId` the frontend `appendDiagnosticReference`
 *    fishes out — so EVERY call site now surfaces the correlationId
 *    inline, not just the three hand-updated ones (#519).
 *  - unmatched (any other throwable) → falls through to a typed
 *    `AI_UNAVAILABLE` 503. The diagnostic reference is a no-op here
 *    because there's no dispatch trail, which the frontend handles
 *    gracefully (its appendDiagnosticReference is a no-op when absent).
 *
 * Callers that need to special-case non-AI errors (USER_NOT_FOUND,
 * VALIDATION_ERROR, …) should branch on those FIRST and only delegate
 * the residual `catch` to this helper — see career360.ts.
 *
 * @param c     Hono context to emit the JSON response from.
 * @param err   The caught error.
 * @param tag   Optional log tag (e.g. "[resumes/optimize]") — logged
 *              alongside `err` so SA can grep the correlationId line.
 */
export function aiFailure(c: Context, err: unknown, tag?: string) {
  if (tag) logger.error(tag, err);
  const envelope = buildAIErrorEnvelope(err);
  if (envelope) {
    return c.json(
      error(envelope.code, envelope.message, envelope.payload),
      envelope.status,
    );
  }
  return c.json(
    error(GENERIC_AI_FAILURE.code, GENERIC_AI_FAILURE.message),
    GENERIC_AI_FAILURE.status,
  );
}
