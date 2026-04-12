/**
 * API Error Event — framework-agnostic event bus for API error notifications.
 *
 * The HTTP client dispatches a CustomEvent on every 4xx/5xx response.
 * UI layers (GlobalErrorHandler) listen and render toast notifications.
 * Neither side imports the other — they communicate solely via this event.
 */

export interface ApiErrorEvent {
  timestamp: string;
  /** HTTP method (GET, POST, etc.) */
  method: string;
  /** Full request URL */
  url: string;
  /** HTTP status code */
  status: number;
  /** App-specific error code from API (e.g. VALIDATION_ERROR) */
  code?: string;
  /** Human-readable error message */
  message: string;
  /** Nested error details from API response */
  details?: unknown;
  /** Server's X-Request-Id header for tracing */
  requestId?: string;
}

export const API_ERROR_EVENT = "hired:api-error" as const;

/**
 * Dispatch an API error event on `window`.
 * Automatically stamps the event with an ISO timestamp.
 */
export function dispatchApiError(
  event: Omit<ApiErrorEvent, "timestamp">,
): void {
  window.dispatchEvent(
    new CustomEvent<ApiErrorEvent>(API_ERROR_EVENT, {
      detail: { ...event, timestamp: new Date().toISOString() },
    }),
  );
}
