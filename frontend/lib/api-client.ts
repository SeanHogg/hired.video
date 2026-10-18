/**
 * Comprehensive API client with type safety, error handling, and interceptors.
 *
 * Facade: the client class + default instance live here; the building blocks
 * live under lib/api/* —
 *   - types.ts         request/client config + interceptor contracts
 *   - interceptors.ts  ordered request/response/error interceptor chains
 *   - transport.ts     fetch round-trip (headers, body, timeout, abort)
 *   - envelope.ts      JSON body read, `{ success, data }` mapping, raw parse
 *   - error-mapping.ts API error body → typed AppError (+ auth side effects)
 *   - error-events.ts  global `hired:api-error` event + silence policy
 *   - raw-request.ts   non-envelope endpoints (getRaw / requestRaw)
 *   - streaming.ts     SSE / NDJSON streamed responses (openStream)
 * Every export this module has always had is still exported from here.
 */

import type { z } from "zod";
import type { ApiSuccessResponse } from "@shared/api";
import { NetworkError, normalizeError } from "./errors";
import { logApiCall } from "./logger";
import { getAuthToken, getEmulationToken } from "./api/auth-token";
import { buildApiUrl, getApiBaseUrl } from "./api/base-url";
import { ensureFreshToken } from "./api/token-refresh";
import {
  nextLogId,
  pushApiLogEntry,
  recordLogEntryError,
  recordLogEntryResponse,
} from "./api/request-log";
import { InterceptorChain } from "./api/interceptors";
import { executeRequest as executeFetch, requestIdOf } from "./api/transport";
import { readJsonBody, toSuccessEnvelope } from "./api/envelope";
import { emitApiError } from "./api/error-events";
import { requestRawBody } from "./api/raw-request";
import { openStreamRequest } from "./api/streaming";
import { isFinalFailure, maxAttemptsFor, waitBeforeRetry } from "./api/retry-policy";
import type {
  ApiClientConfig,
  ErrorInterceptor,
  RequestConfig,
  RequestInterceptor,
  RequestPipeline,
  ResponseInterceptor,
} from "./api/types";

export {
  setEmulationTokenGetter,
  standardAuthHeaders,
} from "./api/auth-token";
export { getApiBaseUrl } from "./api/base-url";
export {
  type ApiRequestLogEntry,
  isFailedLogEntry,
  getRecentApiRequests,
  getPendingApiRequests,
  getRecentApiFailures,
} from "./api/request-log";
export { broadcastTokenBudget } from "./api/envelope";
export type {
  ApiClientConfig,
  ErrorInterceptor,
  RequestConfig,
  RequestInterceptor,
  ResponseInterceptor,
} from "./api/types";

// ============================================================================
// API CLIENT CLASS
// ============================================================================

export class ApiClient {
  private baseUrl: string;
  private timeout: number;
  private retries: number;
  private defaultHeaders: Record<string, string>;
  private interceptors = new InterceptorChain();
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
    this.baseUrl = config.baseUrl || getApiBaseUrl();
    // 6 minutes — LLM-backed endpoints (tailor, analyze, insights) can
    // legitimately run for several minutes when OpenRouter's free models
    // are slow. Single source of truth for the client-side abort; longer
    // than any reasonable server-side wall-clock so the user always sees
    // the server's response, not a browser-side NETWORK_ERROR.
    this.timeout = config.timeout || 360_000;
    // ONE transport retry by default (see the retry policy in `request`):
    // a Cloudflare platform 503 (Worker over its resource limit) carries no
    // CORS headers, so the browser reports it as "Failed to fetch" — the same
    // shape as a real network blip. Retrying it 3× quadrupled the load on an
    // already-exhausted isolate (2026-10-04, the kit workspace: every call fired 4×).
    this.retries = config.retries ?? 1;
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

  addRequestInterceptor(interceptor: RequestInterceptor): void {
    this.interceptors.addRequest(interceptor);
  }

  addResponseInterceptor(interceptor: ResponseInterceptor): void {
    this.interceptors.addResponse(interceptor);
  }

  addErrorInterceptor(interceptor: ErrorInterceptor): void {
    this.interceptors.addError(interceptor);
  }

  /** Paths go out verbatim — routes are case-sensitive and ids/tokens in
   *  path params must never be re-cased (see lib/api/base-url.ts). */
  private createUrl(endpoint: string): string {
    return buildApiUrl(endpoint, this.baseUrl);
  }

  private executeRequest(url: string, config: RequestConfig): Promise<Response> {
    return executeFetch(url, config, {
      headers: this.defaultHeaders,
      timeout: this.timeout,
    });
  }

  /** The interceptor + transport seam the raw / streaming paths run through. */
  private readonly pipeline: RequestPipeline = {
    applyRequestInterceptors: (config) => this.interceptors.applyRequest(config),
    execute: (url, config) => this.executeRequest(url, config),
  };

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
    const emulationToken = getEmulationToken() ?? "";
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

    const maxAttempts = maxAttemptsFor(config.method, config.retries, this.retries);

    // Apply request interceptors
    const processedConfig = await this.interceptors.applyRequest(config);

    let lastRequestId: string | undefined;

    while (attempt < maxAttempts) {
      const logId = nextLogId();
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
        lastRequestId = requestIdOf(response);

        // Parse the body ONCE — the same value feeds the diagnostics log
        // and the envelope mapping (no clone + second JSON.parse).
        let responseData: unknown;
        try {
          responseData = await readJsonBody(response);
        } catch (parseError) {
          recordLogEntryResponse(logId, response.status, undefined, startTime);
          throw parseError;
        }
        recordLogEntryResponse(logId, response.status, responseData, startTime);

        const apiResponse = await toSuccessEnvelope<T>(response, responseData, schema);

        logApiCall(method, url, response.status);

        // Apply response interceptors
        const processedResponse =
          await this.interceptors.applyResponse(apiResponse);

        return processedResponse;
      } catch (error) {
        attempt++;
        const normalizedError = normalizeError(error);

        // Update the log entry with error details
        recordLogEntryError(logId, normalizedError.message, startTime, false);

        logApiCall(method, url, undefined, {
          attempt,
          error: normalizedError.message,
        });

        if (isFinalFailure(normalizedError, attempt, maxAttempts)) {
          const processedError =
            await this.interceptors.applyError(normalizedError);

          emitApiError(
            processedError,
            { method, url, requestId: lastRequestId },
            config.suppressErrorEvent,
          );

          throw processedError;
        }

        await waitBeforeRetry(attempt);
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
    // No request interceptors on this path (historical behaviour).
    return requestRawBody<T>(this.pipeline, this.createUrl(endpoint), { method: "GET" }, schema, false);
  }
  // (getRaw has no `config` parameter, so no suppressErrorEvent gate is needed —
  // its callers don't have the feedback-loop concern that error-report.ts does.)

  // Raw request for endpoints that return non-standard envelopes (any method)
  async requestRaw<T>(
    endpoint: string,
    config: RequestConfig = {},
    schema?: z.ZodSchema<T>,
  ): Promise<{ data: T }> {
    return requestRawBody<T>(this.pipeline, this.createUrl(endpoint), config, schema, true);
  }

  /**
   * Open a streamed response (SSE / NDJSON) with the same auth, logging and
   * error mapping as `request`. `config.timeout` bounds only the wait for
   * the response HEADERS; the body is the caller's to read (and to put an
   * idle deadline on). A non-2xx response throws the usual typed error.
   */
  async openStream(endpoint: string, config: RequestConfig = {}): Promise<Response> {
    return openStreamRequest(this.pipeline, this.createUrl(endpoint), config);
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

  /**
   * The unwrapped payload of a `{ success, data }` endpoint, typed — replaces
   * the hand-rolled `(res as any).data?.data ?? (res as any).data` unwraps.
   */
  async fetchData<T>(
    endpoint: string,
    config: RequestConfig = {},
    schema?: z.ZodSchema<T>,
  ): Promise<T> {
    const res = await this.request<T>(endpoint, config, schema);
    return res.data;
  }
}

// ============================================================================
// DEFAULT CLIENT INSTANCE
// ============================================================================

// Create default client instance
export const apiClient = new ApiClient({
  onRequest: async (config) => {
    // Slide the session forward before it lapses (single-flight; no-op unless
    // the token is inside its last day), then attach the current bearer.
    await ensureFreshToken();
    const token = getAuthToken();
    if (token) {
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${token}`,
      };
    }
    return config;
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
