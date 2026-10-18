/**
 * Retry policy for the envelope request path (`ApiClient.request`).
 */
import type { AppError } from "../errors";
import { ValidationError, AuthenticationError, AuthorizationError } from "../errors";

/**
 * Total attempts for one request.
 *
 * Only GET is safely retriable. POST/PUT/PATCH/DELETE are NOT idempotent
 * at the protocol level, and retrying them on network timeouts has caused
 * duplicate resume uploads (2026-04-20: two `isMaster=true` rows created
 * from a single upload when the 30s LLM parse exceeded the client
 * deadline and the retry fired while the backend was still processing).
 * Callers that want retries on a write can pass `retries: N` explicitly
 * — implying they've made the endpoint idempotent (via an idempotency
 * key or a dedupe index).
 */
export function maxAttemptsFor(
  method: string | undefined,
  explicitRetries: number | undefined,
  clientRetries: number,
): number {
  const requestMethod = (method ?? "GET").toUpperCase();
  const defaultRetries = requestMethod === "GET" ? clientRetries : 0;
  return (explicitRetries ?? defaultRetries) + 1;
}

/**
 * Whether a failed attempt is final (no retry).
 *
 * Retry policy: only retry when the failure looks like a
 * transient transport problem (fetch threw, DNS/TCP failure,
 * timeout) — i.e. NetworkError with NO httpStatus in context.
 * Any HTTP response the server actually emitted — incl. 5xx —
 * is a signal that hammering further will amplify the fire.
 * Production tail (2026-05-26) showed `/api/resumes/embedded/:id`
 * returning 503 on Worker CPU exhaustion, and the original
 * retry policy of "retry 3× with exponential backoff on
 * everything except 4xx" multiplied each user retry by 4 and
 * sustained the worker-CPU overload that originally triggered
 * the failure.
 */
export function isFinalFailure(
  error: AppError,
  attempt: number,
  maxAttempts: number,
): boolean {
  const rawStatus = (error.context as { httpStatus?: unknown } | undefined)?.httpStatus;
  const errorHttpStatus = typeof rawStatus === "number" ? rawStatus : undefined;
  const hasServerResponse =
    errorHttpStatus !== undefined ||
    /^HTTP \d{3}:/.test(error.message);
  return (
    error instanceof ValidationError ||
    error instanceof AuthenticationError ||
    error instanceof AuthorizationError ||
    hasServerResponse ||
    attempt >= maxAttempts
  );
}

/** Wait before retry (exponential backoff + jitter, so the parallel
 *  calls of one page don't all re-land on the same isolate at once). */
export function waitBeforeRetry(attempt: number): Promise<void> {
  const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000) + Math.random() * 750;
  return new Promise((resolve) => setTimeout(resolve, delay));
}
