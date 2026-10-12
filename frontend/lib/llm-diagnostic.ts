/**
 * Frontend extractor for the LLM dispatch diagnostic payload that the
 * API attaches to AI-failure responses (`AI_UNAVAILABLE`,
 * `AI_RATE_LIMITED`, `AI_INVALID_RESPONSE`, `AI_AUTH_FAILED`).
 *
 * The backend shape is built in api/src/services/adapters/llm-error.ts
 * by `buildAIErrorEnvelope` — it lands in our error response under
 * `error.details = { correlationId, classification, attemptCount,
 * lastAttempt, attempts[] }`. The api-client folds that object into
 * `NetworkError.context`, so by the time it reaches the toast or a
 * page-level handler the diagnostic fields can be in either place
 * depending on whether the caller catches the AppError directly or
 * just sees the raw `details` from the toast event.
 *
 * This helper is the ONE place that knows how to fish those fields
 * out — every UI surface (global toast, page-level inline errors,
 * support-ticket markdown builder) imports it so the shape can never
 * drift between consumers.
 */

import type { ApiErrorEvent } from "@shared/errors/apiErrorEvent";

/** Roll-up classification mirrored from `LLMDispatchError.classification`. */
export type LLMDiagnosticKind =
  | "rate_limit"
  | "timeout"
  | "auth"
  | "schema"
  | "empty"
  | "network"
  | "unknown"
  | "mixed";

/** One gateway-side failover inside a single profile attempt. Mirrored
 *  from `LLMFailoverEvent` on the API side (SDK ≥0.7). */
export interface LLMDiagnosticFailover {
  model: string;
  vendor: string;
  code: number;
}

/** Single source of truth for the attempt shape so `lastAttempt` and
 *  `attempts[]` can't drift on the frontend either. */
export interface LLMDiagnosticAttempt {
  model: string;
  durationMs: number;
  kind: LLMDiagnosticKind;
  status?: number;
  code?: string;
  requestId?: string;
  message: string;
  /** Upstream vendor that handled the attempt (openrouter / cerebras /
   *  nvidia / ollama / googleai / …). Surfaced so support tickets can
   *  show vendor concentration at a glance. Undefined only for
   *  pre-dispatch errors (auth, validation, plan-cap) where no
   *  upstream was ever selected by the gateway. */
  vendor?: string;
  /** Inner gateway cascade trail when `429 cascade_exhausted`. */
  failovers?: ReadonlyArray<LLMDiagnosticFailover>;
}

export interface LLMDiagnostic {
  correlationId: string;
  classification: LLMDiagnosticKind;
  attemptCount: number;
  lastAttempt?: Omit<LLMDiagnosticAttempt, "durationMs">;
  /** Per-profile attempt trail when the API surfaced it. */
  attempts?: ReadonlyArray<LLMDiagnosticAttempt>;
}

/** Best-effort lookup at every shape we've seen the diagnostic
 *  payload arrive in — toast `details`, AppError `context`, raw
 *  envelope `error.details`. Returns null when the input doesn't
 *  carry a recognizable LLM dispatch trail (so callers can branch on
 *  `if (diag) ...`). */
export function extractLLMDiagnostic(input: unknown): LLMDiagnostic | null {
  if (!input || typeof input !== "object") return null;

  // Walk the candidate containers in priority order. Each may be the
  // payload itself or wrap it under `details` / `context`.
  const candidates: unknown[] = [
    input,
    (input as { details?: unknown }).details,
    (input as { context?: unknown }).context,
    (input as { error?: { details?: unknown } }).error?.details,
  ];

  for (const c of candidates) {
    if (!c || typeof c !== "object") continue;
    const o = c as Record<string, unknown>;
    const correlationId = typeof o.correlationId === "string" ? o.correlationId : undefined;
    if (!correlationId || !correlationId.startsWith("llm-")) continue;
    const classification = typeof o.classification === "string"
      ? (o.classification as LLMDiagnosticKind)
      : "unknown";
    const attemptCount = typeof o.attemptCount === "number" ? o.attemptCount : 0;
    const lastAttempt = o.lastAttempt && typeof o.lastAttempt === "object"
      ? (o.lastAttempt as LLMDiagnostic["lastAttempt"])
      : undefined;
    const attempts = Array.isArray(o.attempts)
      ? (o.attempts as LLMDiagnostic["attempts"])
      : undefined;
    return { correlationId, classification, attemptCount, lastAttempt, attempts };
  }
  return null;
}

/** One-line user-facing reference text — paste-friendly so a user
 *  copying the toast message includes it in their support email. */
export function formatDiagnosticReference(diag: LLMDiagnostic): string {
  return `Reference: ${diag.correlationId}`;
}

/** Append the correlationId to a base error message when the
 *  diagnostic payload is present. No-op when not, so callers can
 *  blindly wrap their `setError(msg)` calls. */
export function appendDiagnosticReference(
  baseMessage: string,
  fromError: unknown,
): string {
  const diag = extractLLMDiagnostic(fromError);
  if (!diag) return baseMessage;
  return `${baseMessage}\n\n${formatDiagnosticReference(diag)}`;
}

/** Map an `ApiErrorEvent` to the diagnostic payload (or null). The
 *  GlobalErrorHandler toast feeds the event straight in. */
export function diagnosticFromEvent(event: ApiErrorEvent): LLMDiagnostic | null {
  return extractLLMDiagnostic(event.details);
}
