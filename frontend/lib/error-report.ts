/**
 * Client-side error reporter.
 *
 * Posts a normalized error payload to /api/errors/report when the user
 * clicks the "Report this error" button in GlobalErrorHandler /
 * ErrorBoundary. The endpoint forwards to email + New Relic.
 *
 * Goes through the standard apiClient with suppressErrorEvent: true so
 * a failed report does not dispatch `hired:api-error`, which would loop
 * back through GlobalErrorHandler and re-toast the user.
 */

import { apiClient } from "./api-client";
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
  delivered?: { email: boolean; newrelic: boolean };
  errorMessage?: string;
}

interface ReportResponseData {
  received: boolean;
  delivered: { email: boolean; newrelic: boolean };
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
