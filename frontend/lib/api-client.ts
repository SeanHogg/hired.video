/**
 * Comprehensive API client with type safety, error handling, and interceptors
 */

import type { z } from "zod";
import type {
  ApiResponse,
  ApiErrorResponse,
  ApiSuccessResponse,
} from "@shared/api";
import {
  validateApiResponse,
  ApiResponseSchema,
  ApiErrorResponseSchema,
  // Raw validation helper to normalize nulls
  nullToUndefined,
} from "@shared/api";
import type { AppError } from "./errors";
import {
  NetworkError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  normalizeError,
  UnverifiedAccountError,
  RateLimitError,
  AIUsageLimitError,
} from "./errors";
import { logApiCall } from "./logger";
import { runtimeConfig } from "./runtime-config";
import {
  API_ERROR_EVENT,
  type ApiErrorEvent,
} from "@shared/errors/apiErrorEvent";

/**
 * Context stamped on a NetworkError when `fetch()` itself threw — i.e. the
 * browser never received an HTTP response at all (offline, DNS, TLS, a CORS
 * preflight rejection, connection refused, or the client-side timeout abort).
 * `cause` is the raw browser error message ("Failed to fetch" / "Load failed" /
 * "timeout") — the single most diagnostic field. `online` snapshots
 * navigator.onLine so an offline user is obvious in the emailed report.
 * `transport: true` is the flag eventFieldsFromError keys on so these are NOT
 * mislabeled as an HTTP 500 (NetworkError.statusCode hardcodes 500).
 */
function transportErrorContext(cause: string): Record<string, unknown> {
  return {
    transport: true,
    cause,
    online: typeof navigator !== "undefined" ? navigator.onLine : undefined,
  };
}

/** Cap on the non-JSON body snippet we attach to an error report — enough to
 *  carry the Cloudflare ray id / error-page title without bloating the report. */
const MAX_NONJSON_BODY_SNIPPET = 1024;

/**
 * Read a response body as JSON. Reads the raw text first so that, when the body
 * ISN'T valid JSON (an HTML 502/504 from the edge, a truncated gateway page),
 * we can attach the real HTTP status + a capped snippet of the ACTUAL body to
 * the NetworkError. That snippet (Cloudflare ray id, gateway error-page title)
 * is the single most diagnostic bit for an edge/gateway failure — without it
 * these collapse into an opaque "Invalid JSON response" with a fabricated 500,
 * leaving the emailed error report with nothing to act on. Single source of
 * truth for "parse the body, or fail with diagnostics" so handleResponse /
 * getRaw / requestRaw can't drift on what context a non-JSON failure carries.
 */
async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new NetworkError(
      "Invalid JSON response",
      error instanceof Error ? error : undefined,
      {
        httpStatus: response.status,
        statusText: response.statusText,
        bodyText: text.slice(0, MAX_NONJSON_BODY_SNIPPET),
      },
    );
  }
}

/**
 * Dispatch an API error event on `window`. Automatically stamps the event
 * with an ISO timestamp. Frontend-only — lives here (not in shared/)
 * because `window` / `CustomEvent` are DOM-only types and the API
 * compilation pulls shared/ in.
 */
function dispatchApiError(event: Omit<ApiErrorEvent, "timestamp">): void {
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
function eventFieldsFromError(
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
 * Some upstream error responses use a loose `{ error: { code, message, ... } }`
 * shape WITHOUT a `success: false` envelope — notably anything thrown from
 * the API's globalErrorHandler (e.g. drizzle "relation does not exist"
 * surfacing as INTERNAL_ERROR). Without this extractor we'd fail strict
 * schema validation and fall through to a generic
 * `new NetworkError("HTTP 500: Request failed")`, dropping the actionable
 * server code, message, and `_source` stack frame.
 */
function extractLooseErrorEnvelope(
  data: unknown,
): { code: string; message: string; details: Record<string, unknown> } | null {
  if (!data || typeof data !== "object" || !("error" in data)) return null;
  const errObj = (data as { error: unknown }).error;
  if (!errObj || typeof errObj !== "object") return null;
  const e = errObj as Record<string, unknown>;
  if (typeof e.code !== "string" || typeof e.message !== "string") return null;

  const baseDetails =
    e.details && typeof e.details === "object" && !Array.isArray(e.details)
      ? (e.details as Record<string, unknown>)
      : {};
  const details: Record<string, unknown> = { ...baseDetails };
  // Preserve `_source` (server-side stack frame) and any sibling diagnostic
  // fields so SuperAdmin can see the originating function/file/line.
  for (const [key, value] of Object.entries(e)) {
    if (key === "code" || key === "message" || key === "details") continue;
    details[key] = value;
  }
  return { code: e.code, message: e.message, details };
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
function isExpectedSilentError(error: AppError): boolean {
  if (error instanceof UnverifiedAccountError) return true;
  if (error instanceof AuthenticationError && !localStorage.getItem("auth_token")) return true;
  // `MAILBOX_REAUTH_REQUIRED` is user-state, not a server fault — Google /
  // Microsoft rejected the stored refresh token (revoked, password change,
  // Testing-app 7-day expiry). The route already flipped the account row
  // to `status: "error"` and the Inbox / Settings surfaces render their
  // own "Reconnect" CTA off that, so suppressing the red global toast
  // avoids a "Support Ticket" prompt for what's a one-click reconnect.
  const serverCode = (error.context as { serverCode?: string } | undefined)?.serverCode;
  if (serverCode === "MAILBOX_REAUTH_REQUIRED") return true;
  return false;
}

/**
 * Tear down auth state and redirect — but only when the caller actually had
 * a session. An anonymous visitor calling an auth-required side endpoint
 * (e.g. /resumes/<id> firing a follow-up analytics fetch) must NOT be
 * redirected; the page should keep rendering and the caller can swallow
 * the AuthenticationError. Without this gate, any public page that fires
 * an auxiliary auth-required call bounces anonymous visitors to /login.
 *
 * Returns true when a session was torn down, false when the caller was
 * already anonymous and nothing happened.
 */
function handleSessionInvalidation(): boolean {
  const hadToken = !!localStorage.getItem("auth_token");
  if (!hadToken) return false;

  localStorage.removeItem("auth_token");
  localStorage.removeItem("current_user");
  localStorage.removeItem("refresh_token");
  window.dispatchEvent(new CustomEvent("auth-logout"));
  setTimeout(() => {
    window.location.replace("/");
  }, 100);
  return true;
}

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export interface RequestConfig {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  retries?: number;
  validateResponse?: boolean;
  // Skip dispatching the global `hired:api-error` event on failure.
  // Used by the error reporter (lib/error-report.ts) to avoid a feedback
  // loop: a failed report would otherwise re-trigger GlobalErrorHandler's
  // toast, which the user could click "Report" on, etc.
  suppressErrorEvent?: boolean;
}

// ============================================================================
// RECENT API REQUEST LOG (ring buffer for error diagnostics)
// ============================================================================

export interface ApiRequestLogEntry {
  id: number;
  method: string;
  url: string;
  requestBody?: unknown;
  status?: number;
  responseBody?: unknown;
  error?: string;
  timestamp: string;
  durationMs?: number;
}

const MAX_LOG_ENTRIES = 10;
// Cap each body at ~2KB so the ring buffer can never balloon (e.g. a single
// resume fetch returning 100KB+) and so /api/errors/report stays under its
// 64KB payload cap. Error envelopes are well under this; success bodies get
// a JSON-stringified preview.
const MAX_BODY_BYTES_FOR_LOG = 2048;
let _logIdCounter = 0;
const _recentApiRequests: ApiRequestLogEntry[] = [];

function truncateBodyForLog(body: unknown): unknown {
  if (body == null) return body;
  let json: string;
  try {
    json = JSON.stringify(body);
  } catch {
    return "[unserializable]";
  }
  if (json.length <= MAX_BODY_BYTES_FOR_LOG) return body;
  return {
    _truncated: true,
    _originalBytes: json.length,
    _preview: json.slice(0, MAX_BODY_BYTES_FOR_LOG),
  };
}

// ============================================================================
// IMPERSONATION (SuperAdmin X-Emulation-Token)
// ============================================================================

// Module-level getter populated by AuthProvider when an impersonation session
// is active. Kept here (not in a React context) so the singleton apiClient can
// read the current token on every request without prop-drilling.
let _emulationTokenGetter: () => string | null = () => null;

/** Called by AuthProvider whenever the impersonation session changes. */
export function setEmulationTokenGetter(getter: () => string | null): void {
  _emulationTokenGetter = getter;
}

// Admin endpoints require the real SA bearer; attaching an emulation token
// makes superAdminMiddleware reject with 403 ("Impersonation tokens cannot
// access SuperAdmin endpoints"). Skip the header for the /admin/ prefix.
function shouldAttachEmulationToken(url: string): boolean {
  try {
    const path = /^https?:\/\//i.test(url) ? new URL(url).pathname : url;
    return !/\/api\/admin\//i.test(path);
  } catch {
    return !/\/api\/admin\//i.test(url);
  }
}

/**
 * Standard auth headers for any hand-rolled fetch client (the Bearer token
 * from localStorage + the active impersonation token), mirroring exactly what
 * the singleton `apiClient` attaches. Secondary clients (e.g. courses-api)
 * must route through this so they can't drift from — or silently omit, as
 * courses-api did, 401ing every authenticated call — the canonical auth rules.
 */
export function standardAuthHeaders(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const token = localStorage.getItem("auth_token");
  if (token) out.Authorization = `Bearer ${token}`;
  const emuToken = _emulationTokenGetter();
  if (emuToken && shouldAttachEmulationToken(url)) out["X-Emulation-Token"] = emuToken;
  return out;
}

function pushApiLogEntry(entry: ApiRequestLogEntry): void {
  if (entry.requestBody !== undefined) {
    entry.requestBody = truncateBodyForLog(entry.requestBody);
  }
  _recentApiRequests.push(entry);
  if (_recentApiRequests.length > MAX_LOG_ENTRIES) {
    _recentApiRequests.shift();
  }
}

function findLogEntry(id: number): ApiRequestLogEntry | undefined {
  return _recentApiRequests.find((e) => e.id === id);
}

function recordLogEntryResponse(
  id: number,
  status: number,
  body: unknown,
  startTime: number,
): void {
  const entry = findLogEntry(id);
  if (entry) {
    entry.status = status;
    entry.responseBody = truncateBodyForLog(body);
    entry.durationMs = Date.now() - startTime;
  }
}

/** Returns a snapshot of the most recent API requests/responses for error diagnostics. */
export function getRecentApiRequests(): ApiRequestLogEntry[] {
  return [..._recentApiRequests];
}

export interface ApiClientConfig {
  baseUrl?: string;
  timeout?: number;
  retries?: number;
  headers?: Record<string, string>;
  onRequest?: (config: RequestConfig) => RequestConfig | Promise<RequestConfig>;
  onResponse?: <T>(
    response: ApiSuccessResponse<T>,
  ) => ApiSuccessResponse<T> | Promise<ApiSuccessResponse<T>>;
  onError?: (error: AppError) => AppError | Promise<AppError>;
}

export interface RequestInterceptor {
  (config: RequestConfig): RequestConfig | Promise<RequestConfig>;
}

export interface ResponseInterceptor {
  <T>(
    response: ApiSuccessResponse<T>,
  ): ApiSuccessResponse<T> | Promise<ApiSuccessResponse<T>>;
}

export interface ErrorInterceptor {
  (error: AppError): AppError | Promise<AppError>;
}

// ============================================================================
// API CLIENT CLASS
// ============================================================================

export class ApiClient {
  private baseUrl: string;
  private timeout: number;
  private retries: number;
  private defaultHeaders: Record<string, string>;
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];
  private errorInterceptors: ErrorInterceptor[] = [];
  // In-flight GET coalescing. Concurrent identical GETs share one network
  // round-trip + one resolved value; the entry is cleared on settle. This
  // collapses the duplicate fetches that fire when several components each
  // call the same user-data hook (useSubscription, my-scope, token budget…)
  // in one render. Keyed by URL + emulation token (auth token is
  // session-global, so it can't differ between two concurrent requests in
  // the same tab; the emulation token can, so it's part of the key).
  // GET only — non-idempotent writes must never be deduped.
  private inFlightGets = new Map<string, Promise<ApiSuccessResponse<unknown>>>();

  constructor(config: ApiClientConfig = {}) {
    // Use runtime config if available, otherwise fall back to build env vars.
    // Runtime config is expected to come from /config.js (or be injected at runtime).
    this.baseUrl =
      config.baseUrl ||
      runtimeConfig.apiUrl ||
      import.meta.env.VITE_API_URL ||
      import.meta.env.VITE_API_BASE_URL ||
      "https://api.hired.video"; // Do not include trailing /api; endpoints include /api
    // 6 minutes — LLM-backed endpoints (tailor, analyze, insights) can
    // legitimately run for several minutes when OpenRouter's free models
    // are slow. Single source of truth for the client-side abort; longer
    // than any reasonable server-side wall-clock so the user always sees
    // the server's response, not a browser-side NETWORK_ERROR.
    this.timeout = config.timeout || 360_000;
    this.retries = config.retries || 3;
    this.defaultHeaders = {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...config.headers,
    };

    // Add default interceptors if provided
    if (config.onRequest) this.addRequestInterceptor(config.onRequest);
    if (config.onResponse) this.addResponseInterceptor(config.onResponse);
    if (config.onError) this.addErrorInterceptor(config.onError);
  }

  // ============================================================================
  // INTERCEPTOR MANAGEMENT
  // ============================================================================

  addRequestInterceptor(interceptor: RequestInterceptor): void {
    this.requestInterceptors.push(interceptor);
  }

  addResponseInterceptor(interceptor: ResponseInterceptor): void {
    this.responseInterceptors.push(interceptor);
  }

  addErrorInterceptor(interceptor: ErrorInterceptor): void {
    this.errorInterceptors.push(interceptor);
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async applyRequestInterceptors(
    config: RequestConfig,
  ): Promise<RequestConfig> {
    let processedConfig = config;

    for (const interceptor of this.requestInterceptors) {
      processedConfig = await interceptor(processedConfig);
    }

    return processedConfig;
  }

  private async applyResponseInterceptors<T>(
    response: ApiSuccessResponse<T>,
  ): Promise<ApiSuccessResponse<T>> {
    let processedResponse = response;

    for (const interceptor of this.responseInterceptors) {
      processedResponse = await interceptor(processedResponse);
    }

    return processedResponse;
  }

  private async applyErrorInterceptors(error: AppError): Promise<AppError> {
    let processedError = error;

    for (const interceptor of this.errorInterceptors) {
      processedError = await interceptor(processedError);
    }

    return processedError;
  }

  private createUrl(endpoint: string): string {
    // Allow absolute URLs to pass through untouched
    if (/^https?:\/\//i.test(endpoint)) {
      return endpoint;
    }

    // Normalize API path casing and slashes to match the backend (which uses lowercase routes).
    // This prevents 404s when the frontend accidentally requests e.g. /api/Users/public
    // and avoids doubling up on /api when baseUrl already includes /api.
    const [pathPart, queryPart] = endpoint.split("?");
    const cleanPath = pathPart.replace(/^\/+/, ""); // remove leading slash(es)
    const normalizedPath = cleanPath.replace(/^api\//i, (match) => match.toLowerCase());
    const cleanEndpoint = `${normalizedPath}${queryPart ? `?${queryPart}` : ""}`;

    const cleanBaseUrl = this.baseUrl.endsWith("/")
      ? this.baseUrl.slice(0, -1)
      : this.baseUrl;

    const baseEndsWithApi = /\/api$/i.test(cleanBaseUrl);
    const endpointStartsWithApi = /^api\//i.test(cleanEndpoint);

    // Build the final URL, ensuring we never introduce double-slashes in the path.
    const rawUrl = baseEndsWithApi && endpointStartsWithApi
      ? `${cleanBaseUrl}/${cleanEndpoint.replace(/^api\//i, "")}`
      : `${cleanBaseUrl}/${cleanEndpoint}`;

    // Collapse any accidental double-slashes in the path portion (excluding protocol)
    // e.g. http://localhost:8787/api//api/Users -> http://localhost:8787/api/api/Users
    const collapsedUrl = rawUrl.replace(/([^:]\/\/)+/g, "$1");

    // Normalize casing for paths under /api/ to avoid frontend casing mistakes
    // (e.g., /api/Auth/login should map to /api/auth/login)
    try {
      const parsed = new URL(collapsedUrl, "http://dummy");
      if (parsed.pathname.toLowerCase().startsWith("/api/")) {
        const segments = parsed.pathname.split("/");
        parsed.pathname = ["", "api", ...segments.slice(2).map((s) => s.toLowerCase())].join("/");
      }
      // If the caller provided a relative endpoint, preserve relative output
      if (!/^https?:\/\//i.test(collapsedUrl)) {
        return `${parsed.pathname}${parsed.search}`;
      }
      return parsed.toString();
    } catch {
      return collapsedUrl;
    }
  }

  private async executeRequest(
    url: string,
    config: RequestConfig,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      config.timeout || this.timeout,
    );

    try {
      // Prepare headers
      const headers = { ...this.defaultHeaders, ...config.headers };

      // Prepare body
      let body: string | FormData | undefined;
      if (config.body !== undefined && config.body !== null) {
        if (config.body instanceof FormData) {
          // For FormData, don't set Content-Type (let browser set it with boundary)
          delete headers["Content-Type"];
          body = config.body;
        } else if (typeof config.body === "string") {
          // If the caller already provided a string body, pass it through as-is
          body = config.body;
        } else {
          // For regular objects, stringify as JSON
          body = JSON.stringify(config.body);
        }
      }
      // Avoid sending Content-Type on requests with no body (e.g., GET) to satisfy servers with strict content negotiation
      if (body === undefined) {
        delete headers["Content-Type"];
      }

      // Attach X-Emulation-Token for active impersonation sessions — but never
      // to /api/admin/* endpoints (those require the real SA bearer).
      const emuToken = _emulationTokenGetter();
      if (emuToken && shouldAttachEmulationToken(url)) {
        headers["X-Emulation-Token"] = emuToken;
      }

      const response = await fetch(url, {
        method: config.method || "GET",
        headers,
        body,
        credentials: "include",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        throw new NetworkError("Request timeout", error, transportErrorContext("timeout"));
      }

      const cause = error instanceof Error ? error.message : String(error);
      throw new NetworkError(
        "Network request failed",
        error instanceof Error ? error : undefined,
        transportErrorContext(cause),
      );
    }
  }

  private async handleResponse<T>(
    response: Response,
    schema?: z.ZodType<T>,
  ): Promise<ApiSuccessResponse<T>> {
    console.log("ApiClient.handleResponse: Processing response", {
      status: response.status,
      statusText: response.statusText,
      url: response.url,
    });

    const responseData = await readJsonBody(response);
    console.log("ApiClient.handleResponse: Raw response data", responseData);

    // Handle HTTP error status codes
    if (!response.ok) {
      console.log("ApiClient.handleResponse: Response not OK, handling error", {
        status: response.status,
        responseData,
      });
      return this.handleErrorResponse(response.status, responseData);
    }

    // Validate response structure
    console.log("ApiClient.handleResponse: Validating API response structure");
    const validationResult = validateApiResponse(
      responseData,
      ApiResponseSchema,
    );
    if (!validationResult.success) {
      const errorMessage =
        "error" in validationResult
          ? validationResult.error
          : "Unknown validation error";
      console.error(
        "ApiClient.handleResponse: API response validation failed",
        errorMessage,
      );
      throw new ValidationError(
        `Invalid API response structure: ${errorMessage}`,
      );
    }

    const apiResponse = validationResult.data;
    console.log(
      "ApiClient.handleResponse: API response structure valid",
      apiResponse,
    );

    // Handle API-level errors
    if (!apiResponse.success) {
      console.log("ApiClient.handleResponse: Response indicates error");
      const errorResponse = apiResponse as ApiErrorResponse;
      throw this.createErrorFromResponse(errorResponse);
    }

    // Extract and validate data
    const successResponse: ApiSuccessResponse<T> = {
      success: true,
      data: apiResponse.data as T,
      message: apiResponse.message,
      timestamp: apiResponse.timestamp,
    };

    // Piggy-back token-budget envelope — AI-metered endpoints include a
    // `tokenBudget` field on every response so the AI-tokens pill updates
    // in real time without a second round-trip. Preserve it on the typed
    // response AND broadcast via a window event so hooks/components can
    // react without prop drilling.
    const rawBudget = (apiResponse as { tokenBudget?: unknown }).tokenBudget;
    if (rawBudget && typeof rawBudget === "object") {
      successResponse.tokenBudget = rawBudget as ApiSuccessResponse<T>["tokenBudget"];
      if (typeof window !== "undefined") {
        try {
          window.dispatchEvent(
            new CustomEvent("token-budget:update", { detail: rawBudget }),
          );
        } catch {
          // Non-DOM environment (tests, SSR); skip.
        }
      }
    }

    console.log(
      "ApiClient.handleResponse: Success response created",
      successResponse,
    );

    if (schema) {
      console.log("ApiClient.handleResponse: Validating data against schema");
      const dataValidation = validateApiResponse(successResponse.data, schema);
      if (!dataValidation.success) {
        const errorMessage =
          "error" in dataValidation
            ? dataValidation.error
            : "Unknown validation error";
        console.error(
          "ApiClient.handleResponse: Data validation failed",
          errorMessage,
          successResponse.data,
        );
        throw new ValidationError(`Invalid response data: ${errorMessage}`);
      }
      successResponse.data = dataValidation.data;
      console.log("ApiClient.handleResponse: Data validation successful");
    }

    console.log("ApiClient.handleResponse: Returning success response");
    return successResponse;
  }

  private handleErrorResponse(status: number, data: unknown): never {
    console.log("ApiClient.handleErrorResponse: Called with status", status);

    // Try to parse as API error response
    const errorValidation = validateApiResponse(data, ApiErrorResponseSchema);

    if (errorValidation.success) {
      console.log(
        "ApiClient.handleErrorResponse: Using structured error response",
      );
      throw this.createErrorFromResponse(errorValidation.data, status);
    }

    // Loose envelope: `{ error: { code, message, ... } }` with no `success`
    // field. The API's globalErrorHandler returns this shape for unhandled
    // exceptions (incl. the `_source` stack frame), and previously we'd
    // collapse it to "HTTP 500: Request failed" — dropping every actionable
    // detail. Forward to createErrorFromResponse so callers see the real
    // code, message, and diagnostics.
    const loose = extractLooseErrorEnvelope(data);
    if (loose) {
      console.log(
        "ApiClient.handleErrorResponse: Using loose error envelope",
        loose,
      );
      throw this.createErrorFromResponse({ success: false, error: loose }, status);
    }

    // Note: ACCOUNT_DELETED errors are handled in createErrorFromResponse
    // since they come as structured API responses with success: false

    // Fallback to HTTP status-based errors
    switch (status) {
      case 401:
        handleSessionInvalidation();
        throw new AuthenticationError("Authentication required");
      case 403:
        throw new AuthorizationError("Access forbidden");
      case 404:
        throw new NotFoundError("Resource not found");
      case 429: {
        // Rate limit exceeded - try to extract details from data
        const rlData = data as any;
        const errorCode = rlData?.error?.code;
        // If the server sent USAGE_LIMIT_EXCEEDED, surface it as AIUsageLimitError
        if (errorCode === "USAGE_LIMIT_EXCEEDED" || errorCode === "AI_USAGE_LIMIT_REACHED") {
          const usageInfo = rlData?.error?.usage || {};
          throw new AIUsageLimitError(
            rlData?.error?.message || "AI usage limit exceeded",
            rlData?.error?.upgradeUrl || "/pricing",
            usageInfo.used,
            usageInfo.limit,
          );
        }
        throw new RateLimitError(
          rlData?.message || "Rate limit exceeded",
          rlData?.data?.upgradeUrl,
          rlData?.data?.used,
          rlData?.data?.limit,
          rlData?.data?.remaining,
        );
      }
      default:
        // Preserve the raw response body so the dev toast can still show
        // whatever the server emitted, even if it doesn't match either
        // envelope shape.
        throw new NetworkError(`HTTP ${status}: Request failed`, undefined, {
          httpStatus: status,
          responseBody: truncateBodyForLog(data),
        });
    }
  }

  private createErrorFromResponse(errorResponse: ApiErrorResponse, httpStatus?: number): AppError {
    const { error } = errorResponse;
    console.log("ApiClient.createErrorFromResponse: Processing error", error);

    switch (error.code) {
      case "VALIDATION_ERROR":
        return new ValidationError(error.message, undefined, error.details);
      case "ACCOUNT_UNVERIFIED":
      case "EMAIL_NOT_VERIFIED":
        // Broadcast so AuthProvider can flip isEmailVerified and the global
        // gate can take over. Do NOT clear auth or redirect here.
        try {
          window.dispatchEvent(new CustomEvent("auth-email-unverified"));
        } catch {
          // no-op (SSR / non-browser)
        }
        return new UnverifiedAccountError(error.message, error.details);
      case "AI_USAGE_LIMIT_REACHED":
      case "USAGE_LIMIT_EXCEEDED":
      case "TOKEN_BUDGET_EXCEEDED": {
        // AI usage limit exceeded - extract upgrade info from data. The
        // per-user TOKEN_BUDGET_EXCEEDED case (#528) carries the limit
        // numbers on `error.budget`; vendor-plan paths put them on `data`.
        // Both land on AIUsageLimitError so `<GlobalAIUsageBanner>` and
        // `<GlobalErrorHandler>` agree on the upgrade-prompt path.
        const aiData = (errorResponse as any).data || {};
        const budget = (error as any).budget || {};
        return new AIUsageLimitError(
          error.message,
          aiData.upgradeUrl || "/pricing",
          aiData.used ?? budget.used,
          aiData.limit ?? budget.limit,
          aiData.remaining ?? budget.remaining,
          error.details,
        );
      }
      case "RATE_LIMIT_EXCEEDED":
        // General rate limit exceeded
        const rateLimitData = (errorResponse as any).data || {};
        return new RateLimitError(
          error.message,
          rateLimitData.upgradeUrl || "/pricing",
          rateLimitData.used,
          rateLimitData.limit,
          rateLimitData.remaining,
          error.details,
        );
      case "AUTHENTICATION_ERROR":
      case "UNAUTHORIZED":
      case "ACCOUNT_DELETED":
        handleSessionInvalidation();
        return new AuthenticationError(error.message, error.details);
      case "AUTHORIZATION_ERROR":
        return new AuthorizationError(error.message, error.details);
      case "NOT_FOUND":
      case "NOT_FOUND_ERROR":
      case "RESUME_PRIVATE": {
        // Preserve the server-sent code in context so callers can distinguish
        // "doesn't exist" from "exists but restricted" (e.g. private resumes).
        const detailsObj = error.details && typeof error.details === "object" ? error.details : {};
        return new NotFoundError(error.message, { ...detailsObj, serverCode: error.code });
      }
      default: {
        // Stash the server's original error code AND the real HTTP status
        // in context. Without httpStatus the toast would always read "500"
        // because NetworkError hardcodes 500 — a 402 quota rejection from
        // the upload route then misleadingly reads as a server crash. The
        // dispatched event prefers `httpStatus` from context when present.
        const detailsObj =
          error.details && typeof error.details === "object" ? error.details : {};
        return new NetworkError(error.message, undefined, {
          ...detailsObj,
          serverCode: error.code,
          httpStatus,
        });
      }
    }
  }

  // ============================================================================
  // PUBLIC METHODS
  // ============================================================================

  async request<T>(
    endpoint: string,
    config: RequestConfig = {},
    schema?: z.ZodSchema<T>,
  ): Promise<ApiSuccessResponse<T>> {
    const method = (config.method ?? "GET").toUpperCase();
    // Writes are not idempotent — dispatch directly, never coalesce.
    if (method !== "GET") {
      return this.dispatchRequest<T>(endpoint, config, schema);
    }

    const url = this.createUrl(endpoint);
    const emulationToken = _emulationTokenGetter() ?? "";
    const key = `${url} ${emulationToken}`;

    const existing = this.inFlightGets.get(key);
    if (existing) {
      return existing as Promise<ApiSuccessResponse<T>>;
    }

    const pending = this.dispatchRequest<T>(endpoint, config, schema).finally(
      () => {
        this.inFlightGets.delete(key);
      },
    );
    this.inFlightGets.set(
      key,
      pending as Promise<ApiSuccessResponse<unknown>>,
    );
    return pending;
  }

  private async dispatchRequest<T>(
    endpoint: string,
    config: RequestConfig = {},
    schema?: z.ZodSchema<T>,
  ): Promise<ApiSuccessResponse<T>> {
    const url = this.createUrl(endpoint);
    let attempt = 0;

    // Only GET is safely retriable. POST/PUT/PATCH/DELETE are NOT idempotent
    // at the protocol level, and retrying them on network timeouts has caused
    // duplicate resume uploads (2026-04-20: two `isMaster=true` rows created
    // from a single upload when the 30s LLM parse exceeded the client
    // deadline and the retry fired while the backend was still processing).
    // Callers that want retries on a write can pass `retries: N` explicitly
    // — implying they've made the endpoint idempotent (via an idempotency
    // key or a dedupe index).
    const requestMethod = (config.method ?? "GET").toUpperCase();
    const defaultRetries = requestMethod === "GET" ? this.retries : 0;
    const maxAttempts = (config.retries ?? defaultRetries) + 1;

    // Apply request interceptors
    const processedConfig = await this.applyRequestInterceptors(config);

    let lastRequestId: string | undefined;

    while (attempt < maxAttempts) {
      const logId = ++_logIdCounter;
      const startTime = Date.now();
      const method = processedConfig.method || "GET";

      // Record the request in the ring buffer immediately
      pushApiLogEntry({
        id: logId,
        method,
        url,
        requestBody: processedConfig.body,
        timestamp: new Date().toISOString(),
      });

      try {
        logApiCall(method, url, undefined, {
          attempt: attempt + 1,
        });

        const response = await this.executeRequest(url, processedConfig);
        lastRequestId = response.headers.get("x-request-id") ?? undefined;

        // Clone the response so we can read the body for logging without consuming it
        const clonedResponse = response.clone();
        let rawResponseBody: unknown;
        try {
          rawResponseBody = await clonedResponse.json();
        } catch {
          // non-JSON response; leave undefined
        }

        const apiResponse = await this.handleResponse<T>(response, schema);

        logApiCall(method, url, response.status);

        recordLogEntryResponse(logId, response.status, rawResponseBody, startTime);

        // Apply response interceptors
        const processedResponse =
          await this.applyResponseInterceptors(apiResponse);

        return processedResponse;
      } catch (error) {
        attempt++;
        const normalizedError = normalizeError(error);

        // Update the log entry with error details
        const entry = findLogEntry(logId);
        if (entry) {
          entry.error = normalizedError.message;
          entry.durationMs = Date.now() - startTime;
        }

        logApiCall(method, url, undefined, {
          attempt,
          error: normalizedError.message,
        });

        // Retry policy: only retry when the failure looks like a
        // transient transport problem (fetch threw, DNS/TCP failure,
        // timeout) — i.e. NetworkError with NO httpStatus in context.
        // Any HTTP response the server actually emitted — incl. 5xx —
        // is a signal that hammering further will amplify the fire.
        // Production tail (2026-05-26) showed `/api/resumes/embedded/:id`
        // returning 503 on Worker CPU exhaustion, and the original
        // retry policy of "retry 3× with exponential backoff on
        // everything except 4xx" multiplied each user retry by 4 and
        // sustained the worker-CPU overload that originally triggered
        // the failure.
        const errorHttpStatus =
          typeof (normalizedError.context as any)?.httpStatus === "number"
            ? ((normalizedError.context as any).httpStatus as number)
            : undefined;
        const hasServerResponse =
          errorHttpStatus !== undefined ||
          /^HTTP \d{3}:/.test(normalizedError.message);
        if (
          normalizedError instanceof ValidationError ||
          normalizedError instanceof AuthenticationError ||
          normalizedError instanceof AuthorizationError ||
          hasServerResponse ||
          attempt >= maxAttempts
        ) {
          const processedError =
            await this.applyErrorInterceptors(normalizedError);

          if (!isExpectedSilentError(processedError) && !config.suppressErrorEvent) {
            dispatchApiError({
              method,
              url,
              ...eventFieldsFromError(processedError),
              requestId: lastRequestId,
            });
          }

          throw processedError;
        }

        // Wait before retry (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // This should never be reached, but TypeScript requires it
    throw new NetworkError("Maximum retry attempts exceeded");
  }

  /**
   * Resolve an endpoint to its ABSOLUTE URL against the API base. For
   * hand-rolled `fetch`/`sendBeacon` callers (unload beacons) that can't route
   * through request()/post() because they need Beacon / `keepalive` semantics.
   * Mirrors createUrl exactly — same base + `/api` de-duplication — so beacons
   * can't drift onto the static frontend origin (which doesn't own /api/* and
   * 405s). Always absolute because the singleton's baseUrl is absolute.
   */
  resolveUrl(endpoint: string): string {
    return this.createUrl(endpoint);
  }

  // Convenience methods
  async get<T>(
    endpoint: string,
    schema?: z.ZodSchema<T>,
    config?: Omit<RequestConfig, "method" | "body">,
  ): Promise<ApiSuccessResponse<T>> {
    return this.request(endpoint, { method: "GET", ...(config ?? {}) }, schema);
  }

  // Raw GET for endpoints that do not use the common { success, data } envelope
  async getRaw<T>(
    endpoint: string,
    schema?: z.ZodSchema<T>,
  ): Promise<{ data: T }> {
    const url = this.createUrl(endpoint);
    const logId = ++_logIdCounter;
    const startTime = Date.now();

    pushApiLogEntry({
      id: logId,
      method: "GET",
      url,
      timestamp: new Date().toISOString(),
    });

    let responseData: unknown;
    let lastRequestId: string | undefined;
    try {
      const response = await this.executeRequest(url, { method: "GET" });
      lastRequestId = response.headers.get("x-request-id") ?? undefined;

      responseData = await readJsonBody(response);

      recordLogEntryResponse(logId, response.status, responseData, startTime);

      if (!response.ok) {
        this.handleErrorResponse(response.status, responseData);
      }

      if (schema) {
        // `nullToUndefined` removed 2026-04-20 — the canonical shared
        // schemas use `.nullable()` which accepts `T | null`, not
        // `T | undefined`. Preprocessing was breaking them.
        const validation = schema.safeParse(responseData);
        if (!validation.success) {
          throw new ValidationError(
            `Invalid response data: ${validation.error.issues.map((i) => i.message).join(", ")}`,
          );
        }
        return { data: validation.data };
      }

      return { data: responseData as T };
    } catch (error) {
      const normalized = normalizeError(error);
      const entry = findLogEntry(logId);
      if (entry && !entry.durationMs) {
        entry.error = normalized.message;
        entry.durationMs = Date.now() - startTime;
      }

      if (!isExpectedSilentError(normalized)) {
        dispatchApiError({
          method: "GET",
          url,
          ...eventFieldsFromError(normalized),
          requestId: lastRequestId,
        });
      }

      throw error;
    }
  }
  // (getRaw has no `config` parameter, so no suppressErrorEvent gate is needed —
  // its callers don't have the feedback-loop concern that error-report.ts does.)

  // Raw request for endpoints that return non-standard envelopes (any method)
  async requestRaw<T>(
    endpoint: string,
    config: RequestConfig = {},
    schema?: z.ZodSchema<T>,
  ): Promise<{ data: T }> {
    const url = this.createUrl(endpoint);
    const logId = ++_logIdCounter;
    const startTime = Date.now();
    const method = config.method || "GET";

    pushApiLogEntry({
      id: logId,
      method,
      url,
      requestBody: config.body,
      timestamp: new Date().toISOString(),
    });

    let lastRequestId: string | undefined;
    try {
      // Apply request interceptors (e.g., Authorization header injection)
      const processedConfig = await this.applyRequestInterceptors(config);

      const response = await this.executeRequest(url, processedConfig);
      lastRequestId = response.headers.get("x-request-id") ?? undefined;

      const responseData = await readJsonBody(response);

      recordLogEntryResponse(logId, response.status, responseData, startTime);

      if (!response.ok) {
        this.handleErrorResponse(response.status, responseData);
      }

      if (schema) {
        // `nullToUndefined` removed 2026-04-20 — the canonical shared
        // schemas use `.nullable()` which accepts `T | null`, not
        // `T | undefined`. Preprocessing was breaking them.
        const validation = schema.safeParse(responseData);
        if (!validation.success) {
          throw new ValidationError(
            `Invalid response data: ${validation.error.issues.map((i) => i.message).join(", ")}`,
          );
        }
        return { data: validation.data };
      }

      return { data: responseData as T };
    } catch (error) {
      const normalized = normalizeError(error);
      const entry = findLogEntry(logId);
      if (entry && !entry.durationMs) {
        entry.error = normalized.message;
        entry.durationMs = Date.now() - startTime;
      }

      if (!config.suppressErrorEvent && !isExpectedSilentError(normalized)) {
        dispatchApiError({
          method,
          url,
          ...eventFieldsFromError(normalized),
          requestId: lastRequestId,
        });
      }

      throw error;
    }
  }

  async post<T>(
    endpoint: string,
    body?: unknown,
    schema?: z.ZodSchema<T>,
  ): Promise<ApiSuccessResponse<T>> {
    return this.request(endpoint, { method: "POST", body }, schema);
  }

  async put<T>(
    endpoint: string,
    body?: unknown,
    schema?: z.ZodSchema<T>,
  ): Promise<ApiSuccessResponse<T>> {
    return this.request(endpoint, { method: "PUT", body }, schema);
  }

  async patch<T>(
    endpoint: string,
    body?: unknown,
    schema?: z.ZodSchema<T>,
  ): Promise<ApiSuccessResponse<T>> {
    return this.request(endpoint, { method: "PATCH", body }, schema);
  }

  async delete<T>(
    endpoint: string,
    schema?: z.ZodSchema<T>,
  ): Promise<ApiSuccessResponse<T>> {
    return this.request(endpoint, { method: "DELETE" }, schema);
  }
}

// ============================================================================
// DEFAULT CLIENT INSTANCE
// ============================================================================

// Create default client instance
export const apiClient = new ApiClient({
  onRequest: async (config) => {
    // Add authentication token if available
    const token = localStorage.getItem("auth_token");
    if (token) {
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${token}`,
      };
    }
    return config;
  },

  onError: async (error) => {
    // Only redirect to /login when the caller had a real session that just
    // got invalidated. Anonymous visitors hitting auth-required side calls
    // (e.g. analytics fetches on a public resume page) must keep rendering.
    if (error instanceof AuthenticationError && localStorage.getItem("auth_token")) {
      localStorage.removeItem("auth_token");
      window.location.href = "/login";
    }
    return error;
  },
});

/**
 * Module helper: resolve an endpoint to its absolute API URL for hand-rolled
 * beacon/fetch callers (usage beacon, artifact-view beacon). Single source of
 * truth so these can't relative-path onto the static frontend origin and 405.
 */
export function resolveApiUrl(endpoint: string): string {
  return apiClient.resolveUrl(endpoint);
}

export default apiClient;
