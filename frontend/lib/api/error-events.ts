/**
 * Global API error events: build + dispatch the `hired:api-error` window
 * event that GlobalErrorHandler / GlobalAIUsageBanner subscribe to, and the
 * policy for which errors stay silent.
 */
import { API_ERROR_EVENT, type ApiErrorEvent } from "@shared/errors/apiErrorEvent";
import type { AppError } from "../errors";
import { AuthenticationError, UnverifiedAccountError } from "../errors";
import { getAuthToken } from "./auth-token";

/**
 * Dispatch an API error event on `window`. Automatically stamps the event
 * with an ISO timestamp. Frontend-only — lives here (not in shared/)
 * because `window` / `CustomEvent` are DOM-only types and the API
 * compilation pulls shared/ in.
 */
export function dispatchApiError(event: Omit<ApiErrorEvent, "timestamp">): void {
  window.dispatchEvent(
    new CustomEvent<ApiErrorEvent>(API_ERROR_EVENT, {
      detail: { ...event, timestamp: new Date().toISOString() },
    }),
  );
}

/**
 * Build the dispatch payload from a normalized AppError. When
 * createErrorFromResponse stashes the server's original code in
 * `context.serverCode` (e.g. INTERNAL_ERROR collapsed into NetworkError),
 * surface that as the event code so the dev toast and "copy support
 * ticket" output show the real backend code instead of the generic
 * NETWORK_ERROR / NOT_FOUND_ERROR / etc. that the AppError class carries.
 */
export function eventFieldsFromError(
  error: AppError,
): Pick<ApiErrorEvent, "status" | "code" | "message" | "details"> {
  const ctx = (error.context ?? {}) as Record<string, unknown>;
  const serverCode = typeof ctx.serverCode === "string" ? ctx.serverCode : undefined;
  // Prefer the actual HTTP status when createErrorFromResponse stashed it,
  // otherwise fall back to AppError's class-default (e.g. NetworkError = 500).
  // Without this, a 402 QUOTA_EXCEEDED reads as 500 in the dev toast.
  const httpStatus = typeof ctx.httpStatus === "number" ? ctx.httpStatus : undefined;

  // Transport failures — fetch() itself threw, so the browser never received an
  // HTTP response. NetworkError hardcodes statusCode 500, which makes these
  // read identically to a genuine server crash in the dev toast AND the emailed
  // error report. They are NOT the same: a transport failure means the API was
  // unreachable (offline, DNS, TLS, CORS preflight, connection refused). Report
  // them as status 0 ("no response") under a distinct code, and fold the real
  // browser cause into the message so the maintainer can tell the two apart at a
  // glance instead of chasing a phantom backend 500.
  if (ctx.transport === true) {
    const cause = typeof ctx.cause === "string" ? ctx.cause : undefined;
    return {
      status: 0,
      code: "NETWORK_UNREACHABLE",
      message: cause ? `${error.message}: ${cause}` : error.message,
      details: error.context,
    };
  }

  return {
    status: httpStatus ?? error.statusCode,
    code: serverCode ?? error.code,
    message: error.message,
    details: error.context,
  };
}

/**
 * Errors we never want to surface as a global toast:
 *   • Anonymous 401 — auth-required side calls on a public page; the caller
 *     swallows the rejection. Without this, every public page that fires an
 *     auxiliary auth call shows a red "An error has occurred" toast.
 *   • Unverified 403 — every authed-but-unverified user is parked on
 *     /verify-email, but background pollers (comm hub, notifications,
 *     connections) keep firing and each rejection would spawn a toast. The
 *     auth-email-unverified event still fires in createErrorFromResponse,
 *     so the verify-email gate still works.
 *
 * AIUsageLimitError IS dispatched (the inline `<GlobalAIUsageBanner>`
 * subscribes to the same `API_ERROR_EVENT` and renders an upgrade CTA);
 * `<GlobalErrorHandler>` filters that code out of its red-toast queue so
 * users only see one surface for it.
 */
export function isExpectedSilentError(error: AppError): boolean {
  if (error instanceof UnverifiedAccountError) return true;
  if (error instanceof AuthenticationError && !getAuthToken()) return true;
  const serverCode = (error.context as { serverCode?: string } | undefined)?.serverCode;
  // `MAILBOX_REAUTH_REQUIRED` is user-state, not a server fault — Google /
  // Microsoft rejected the stored refresh token (revoked, password change,
  // Testing-app 7-day expiry). The route already flipped the account row
  // to `status: "error"` and the Inbox / Settings surfaces render their
  // own "Reconnect" CTA off that, so suppressing the red global toast
  // avoids a "Support Ticket" prompt for what's a one-click reconnect.
  if (serverCode === "MAILBOX_REAUTH_REQUIRED") return true;
  // `PRO_REQUIRED` (402) is an entitlement signal, not a fault — every
  // Pro-gated surface (Hiring & Onboarding, ProfileAudit, …) catches it and
  // renders its own inline upgrade prompt. Dispatching the global red toast
  // on top of that double-surfaces the gate and, worse, hands the user a
  // "Report this error" button that emails the maintainer a non-bug. Treat
  // it like the AI usage-limit gate: the consuming page owns the upgrade UX.
  if (serverCode === "PRO_REQUIRED") return true;
  return false;
}

/**
 * Dispatch the global API error event for a failed call unless the caller
 * suppressed it or the error is one we never surface (isExpectedSilentError).
 * Shared by every request path (envelope, raw, streaming) so the event
 * payload and the silence policy can't drift between them.
 */
export function emitApiError(
  error: AppError,
  request: { method: string; url: string; requestId?: string },
  suppress = false,
): void {
  if (suppress || isExpectedSilentError(error)) return;
  dispatchApiError({
    method: request.method,
    url: request.url,
    ...eventFieldsFromError(error),
    requestId: request.requestId,
  });
}
