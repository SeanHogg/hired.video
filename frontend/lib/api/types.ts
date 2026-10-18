/**
 * Public request / client config + interceptor contracts for the API client.
 * Re-exported by the `@/lib/api-client` facade.
 */
import type { ApiSuccessResponse } from "@shared/api";
import type { AppError } from "../errors";

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
  /** Caller-side abort (e.g. a stream reader torn down before headers). */
  signal?: AbortSignal;
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

/**
 * The transport seam the raw / streaming request paths need from the client:
 * run the request interceptors, then execute the fetch (auth, headers,
 * timeout, emulation token) exactly as `request()` does.
 */
export interface RequestPipeline {
  applyRequestInterceptors(config: RequestConfig): Promise<RequestConfig>;
  execute(url: string, config: RequestConfig): Promise<Response>;
}
