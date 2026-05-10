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

import { LLMDispatchError, type LLMDispatchAttempt } from "./llm-client.js";

export { LLMDispatchError } from "./llm-client.js";
export type { LLMDispatchAttempt } from "./llm-client.js";

// Per-attempt message cap surfaced in the support-ticket payload. Wide
// enough to carry a multi-error Zod validation message (5+ field
// failures with their full `path` + emitted value) so SA can diagnose
// the actual upstream error without round-tripping for logs. Bumping
// this is what closes gap #527 — earlier 500-char limit truncated the
// `invalid_value` payload before the offending category value was
// visible. Still bounded so a runaway error message can't bloat the
// 502 response body.
const MAX_ATTEMPT_MESSAGE_CHARS = 4000;

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
  lastAttempt: {
    model: string;
    kind: LLMDispatchAttempt["kind"];
    status?: number;
    code?: string;
    requestId?: string;
    message: string;
  } | null;
  /** Per-attempt trail. Always included so support tickets carry full
   *  context — vendor identity disclosure is fine here (see file
   *  header for rationale). Omit at the route level if you ever route
   *  this through a public/unauthenticated surface. */
  attempts: ReadonlyArray<{
    model: string;
    durationMs: number;
    kind: LLMDispatchAttempt["kind"];
    status?: number;
    code?: string;
    requestId?: string;
    message: string;
  }>;
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
          message: last.message.slice(0, MAX_ATTEMPT_MESSAGE_CHARS),
        }
      : null,
    attempts: err.attempts.map((a) => ({
      model: a.model,
      durationMs: a.durationMs,
      kind: a.kind,
      status: a.status,
      code: a.code,
      requestId: a.requestId,
      message: a.message.slice(0, MAX_ATTEMPT_MESSAGE_CHARS),
    })),
  };
}

/** HTTP error envelope routes can spread into `c.json(...)`. Mirrors
 *  the existing `error()` helper shape but adds the diagnostic body
 *  for AI failures. Single source of "what does an AI 503 look like"
 *  so career360 / profile-audit / vendor-sync / studio cannot drift. */
export interface AIErrorEnvelope {
  status: 502 | 503;
  code: "AI_UNAVAILABLE" | "AI_INVALID_RESPONSE" | "AI_RATE_LIMITED" | "AI_AUTH_FAILED";
  message: string;
  payload: LLMErrorPayload;
}

/** Map a `LLMDispatchError` to the right HTTP code + user-facing
 *  message based on the classifier. Returns null if `err` isn't a
 *  dispatch error — caller continues their existing error path. */
export function buildAIErrorEnvelope(err: unknown): AIErrorEnvelope | null {
  const payload = summarizeDispatchError(err);
  if (!payload) return null;

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
