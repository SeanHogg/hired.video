/**
 * Client-side error reporter.
 *
 * Posts a normalized error payload to /api/errors/report when the user
 * clicks the "Report this error" button in GlobalErrorHandler /
 * ErrorBoundary. The endpoint forwards to email + New Relic.
 *
 * Uses raw fetch (NOT the apiClient wrapper) on purpose: the wrapper
 * dispatches its own `hired:api-error` events on failure, which would
 * be re-toasted by GlobalErrorHandler — a feedback loop while the user
 * is trying to report a different error. fetch keeps it silent and
 * single-shot.
 */

export type ReportSource = "boundary" | "api" | "manual";

export interface ErrorReportPayload {
  message: string;
  source: ReportSource;
  severity?: string;
  stack?: string;
  url?: string;
  userAgent?: string;
  errorId?: string;
  context?: Record<string, unknown>;
  userNote?: string;
}

export interface ReportResult {
  ok: boolean;
  delivered?: { email: boolean; newrelic: boolean };
  errorMessage?: string;
}

export async function reportClientError(payload: ErrorReportPayload): Promise<ReportResult> {
  // Auto-fill the obvious fields the caller might omit. Cap the stack
  // here too so we don't have to do it on the wire — the backend caps
  // again, but failing fast in the browser is cheaper.
  const enriched: ErrorReportPayload = {
    ...payload,
    url: payload.url ?? (typeof window !== "undefined" ? window.location.href : undefined),
    userAgent: payload.userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : undefined),
    stack: payload.stack ? payload.stack.slice(0, 16_384) : undefined,
  };

  try {
    const res = await fetch("/api/errors/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(enriched),
      // Don't send credentials — endpoint is unauthenticated and we
      // don't want a stale cookie to redirect us anywhere.
      credentials: "omit",
      // Best-effort: a slow network shouldn't trap the user in a
      // spinner forever. If they navigate away, the request can die.
      keepalive: true,
    });

    if (!res.ok) {
      let body: any = null;
      try { body = await res.json(); } catch { /* ignore */ }
      return {
        ok: false,
        errorMessage:
          body?.error?.message ??
          (res.status === 429
            ? "Too many reports — please wait a few minutes and try again."
            : `Server returned ${res.status}.`),
      };
    }

    const body = await res.json().catch(() => null);
    return {
      ok: true,
      delivered: body?.data?.delivered,
    };
  } catch (err) {
    return {
      ok: false,
      errorMessage: err instanceof Error ? err.message : "Network error.",
    };
  }
}
