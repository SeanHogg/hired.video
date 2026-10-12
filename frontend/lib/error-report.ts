/**
 * Client-side error reporter.
 *
 * Posts a normalized error payload to /api/errors/report when the user
 * clicks the "Report this error" button in GlobalErrorHandler /
 * ErrorBoundary. The endpoint emails the report to the maintainer.
 *
 * Goes through the standard apiClient with suppressErrorEvent: true so
 * a failed report does not dispatch `hired:api-error`, which would loop
 * back through GlobalErrorHandler and re-toast the user.
 */

import { apiClient, getRecentApiRequests } from "./api-client";
import { RateLimitError } from "./errors";

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
  delivered?: { email: boolean };
  errorMessage?: string;
}

interface ReportResponseData {
  received: boolean;
  delivered: { email: boolean };
}

/**
 * Diagnostic context attached to EVERY report, regardless of source. Lives here
 * (the one seam all reports flow through) so the api-error path and the React
 * error-boundary path both get it without each re-deriving it — previously only
 * the boundary attached the request ring buffer, so the api-error reports that
 * actually fire on network failures arrived with nothing to debug from.
 *
 *   • recentApiRequests — the last ~10 requests/responses (bodies capped),
 *     the timeline that shows whether ONE endpoint failed or the whole API
 *     went unreachable.
 *   • online — navigator.onLine at report time; an offline user is the most
 *     common cause of a transport "Network request failed" and the cheapest
 *     thing to rule in/out.
 *   • connection — effective connection type / RTT when the browser exposes
 *     the Network Information API (Chromium); flaky-network signal.
 */
function gatherDiagnosticContext(): Record<string, unknown> {
  const ctx: Record<string, unknown> = {};

  try {
    const recent = getRecentApiRequests();
    if (recent.length > 0) ctx.recentApiRequests = recent;
  } catch {
    // Non-browser / test environment — skip.
  }

  if (typeof navigator !== "undefined") {
    ctx.online = navigator.onLine;
    const conn = (navigator as { connection?: Record<string, unknown> }).connection;
    if (conn && typeof conn === "object") {
      ctx.connection = {
        effectiveType: conn.effectiveType,
        downlink: conn.downlink,
        rtt: conn.rtt,
        saveData: conn.saveData,
      };
    }
  }

  return ctx;
}

export async function reportClientError(payload: ErrorReportPayload): Promise<ReportResult> {
  // Auto-fill the obvious fields the caller might omit. Cap the stack
  // here too — the backend caps again, but failing fast in the browser
  // is cheaper than shipping bytes we'll just throw away.
  const enriched: ErrorReportPayload = {
    ...payload,
    url: payload.url ?? (typeof window !== "undefined" ? window.location.href : undefined),
    userAgent: payload.userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : undefined),
    stack: payload.stack ? payload.stack.slice(0, 16_384) : undefined,
    // Auto-gathered diagnostics first, so a caller that already supplied a
    // richer value (e.g. ErrorBoundary's catch-time recentApiRequests snapshot)
    // wins on key collision.
    context: { ...gatherDiagnosticContext(), ...payload.context },
  };

  try {
    const res = await apiClient.request<ReportResponseData>("/api/errors/report", {
      method: "POST",
      body: enriched,
      retries: 0,
      suppressErrorEvent: true,
    });
    return { ok: true, delivered: res.data?.delivered };
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, errorMessage: "Too many reports — please wait a few minutes and try again." };
    }
    return {
      ok: false,
      errorMessage: err instanceof Error ? err.message : "Network error.",
    };
  }
}
