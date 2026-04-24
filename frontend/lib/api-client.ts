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
let _logIdCounter = 0;
const _recentApiRequests: ApiRequestLogEntry[] = [];

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

function pushApiLogEntry(entry: ApiRequestLogEntry): void {
  _recentApiRequests.push(entry);
  if (_recentApiRequests.length > MAX_LOG_ENTRIES) {
    _recentApiRequests.shift();
  }
}

function findLogEntry(id: number): ApiRequestLogEntry | undefined {
  return _recentApiRequests.find((e) => e.id === id);
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
        throw new NetworkError("Request timeout", error);
      }

      throw new NetworkError(
        "Network request failed",
        error instanceof Error ? error : undefined,
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

    let responseData: unknown;

    try {
      responseData = await response.json();
      console.log("ApiClient.handleResponse: Raw response data", responseData);
    } catch (error) {
      console.error("ApiClient.handleResponse: Failed to parse JSON", error);
      throw new NetworkError(
        "Invalid JSON response",
        error instanceof Error ? error : undefined,
      );
    }

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
      throw this.createErrorFromResponse(errorValidation.data);
    }

    // Note: ACCOUNT_DELETED errors are handled in createErrorFromResponse
    // since they come as structured API responses with success: false

    // Fallback to HTTP status-based errors
    switch (status) {
      case 401:
        console.log(
          "API Client: 401 Unauthorized - clearing auth and redirecting",
        );
        // ANY 401 should log the user out immediately
        localStorage.removeItem("auth_token");
        localStorage.removeItem("current_user");
        localStorage.removeItem("refresh_token");

        // Notify auth context
        window.dispatchEvent(new CustomEvent("auth-logout"));

        // Redirect to home
        setTimeout(() => {
          window.location.replace("/");
        }, 100);

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
        throw new NetworkError(`HTTP ${status}: Request failed`);
    }
  }

  private createErrorFromResponse(errorResponse: ApiErrorResponse): AppError {
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
        // AI usage limit exceeded - extract upgrade info from data
        const aiData = (errorResponse as any).data || {};
        return new AIUsageLimitError(
          error.message,
          aiData.upgradeUrl || "/pricing",
          aiData.used,
          aiData.limit,
          aiData.remaining,
          error.details,
        );
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
      case "ACCOUNT_DELETED":
        console.log(
          "API Client: Authentication error - clearing auth and redirecting",
        );
        // ANY authentication error should log the user out immediately
        localStorage.removeItem("auth_token");
        localStorage.removeItem("current_user");
        localStorage.removeItem("refresh_token");

        // Notify auth context
        window.dispatchEvent(new CustomEvent("auth-logout"));

        // Redirect to home
        setTimeout(() => {
          window.location.replace("/");
        }, 100);

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
      default:
        return new NetworkError(error.message, undefined, error.details);
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

        // Update the log entry with response details
        const entry = findLogEntry(logId);
        if (entry) {
          entry.status = response.status;
          entry.responseBody = rawResponseBody;
          entry.durationMs = Date.now() - startTime;
        }

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

        // Don't retry on certain error types
        if (
          normalizedError instanceof ValidationError ||
          normalizedError instanceof AuthenticationError ||
          normalizedError instanceof AuthorizationError ||
          attempt >= maxAttempts
        ) {
          const processedError =
            await this.applyErrorInterceptors(normalizedError);

          dispatchApiError({
            method,
            url,
            status: processedError.statusCode,
            code: processedError.code,
            message: processedError.message,
            details: processedError.context,
            requestId: lastRequestId,
          });

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

  // Convenience methods
  async get<T>(
    endpoint: string,
    schema?: z.ZodSchema<T>,
  ): Promise<ApiSuccessResponse<T>> {
    return this.request(endpoint, { method: "GET" }, schema);
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

      try {
        responseData = await response.json();
      } catch (error) {
        throw new NetworkError(
          "Invalid JSON response",
          error instanceof Error ? error : undefined,
        );
      }

      const entry = findLogEntry(logId);
      if (entry) {
        entry.status = response.status;
        entry.responseBody = responseData;
        entry.durationMs = Date.now() - startTime;
      }

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

      dispatchApiError({
        method: "GET",
        url,
        status: normalized.statusCode,
        code: normalized.code,
        message: normalized.message,
        details: normalized.context,
        requestId: lastRequestId,
      });

      throw error;
    }
  }

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

      let responseData: unknown;
      try {
        responseData = await response.json();
      } catch (error) {
        throw new NetworkError(
          "Invalid JSON response",
          error instanceof Error ? error : undefined,
        );
      }

      const entry = findLogEntry(logId);
      if (entry) {
        entry.status = response.status;
        entry.responseBody = responseData;
        entry.durationMs = Date.now() - startTime;
      }

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

      dispatchApiError({
        method,
        url,
        status: normalized.statusCode,
        code: normalized.code,
        message: normalized.message,
        details: normalized.context,
        requestId: lastRequestId,
      });

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
    // Handle authentication errors by redirecting to login
    if (error instanceof AuthenticationError) {
      localStorage.removeItem("auth_token");
      window.location.href = "/login";
    }
    return error;
  },
});

export default apiClient;
