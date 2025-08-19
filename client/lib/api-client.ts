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
} from "./errors";
import { logApiCall } from "./logger";

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
    // Use environment variable or default to localhost backend
    this.baseUrl = config.baseUrl || import.meta.env.VITE_API_URL || "http://localhost:5000/api";
    this.timeout = config.timeout || 30000; // Increased timeout for backend calls
    this.retries = config.retries || 3;
    this.defaultHeaders = {
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
    const cleanEndpoint = endpoint.startsWith("/")
      ? endpoint.slice(1)
      : endpoint;
    const cleanBaseUrl = this.baseUrl.endsWith("/")
      ? this.baseUrl.slice(0, -1)
      : this.baseUrl;
    return `${cleanBaseUrl}/${cleanEndpoint}`;
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
      if (config.body) {
        if (config.body instanceof FormData) {
          // For FormData, don't set Content-Type (let browser set it with boundary)
          delete headers["Content-Type"];
          body = config.body;
        } else {
          // For regular objects, stringify as JSON
          body = JSON.stringify(config.body);
        }
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
    schema?: z.ZodSchema<T>,
  ): Promise<ApiSuccessResponse<T>> {
    let responseData: unknown;

    try {
      responseData = await response.json();
    } catch (error) {
      throw new NetworkError(
        "Invalid JSON response",
        error instanceof Error ? error : undefined,
      );
    }

    // Handle HTTP error status codes
    if (!response.ok) {
      return this.handleErrorResponse(response.status, responseData);
    }

    // Validate response structure
    const validationResult = validateApiResponse(
      responseData,
      ApiResponseSchema,
    );
    if (!validationResult.success) {
      const errorMessage =
        "error" in validationResult
          ? validationResult.error
          : "Unknown validation error";
      throw new ValidationError(
        `Invalid API response structure: ${errorMessage}`,
      );
    }

    const apiResponse = validationResult.data as ApiResponse;

    // Handle API-level errors
    if (!apiResponse.success) {
      const errorResponse = apiResponse as ApiErrorResponse;
      throw this.createErrorFromResponse(errorResponse);
    }

    // Extract and validate data
    const successResponse: ApiSuccessResponse<T> = {
      success: true,
      data: apiResponse.data,
      message: apiResponse.message,
      timestamp: apiResponse.timestamp,
    };

    if (schema) {
      const dataValidation = validateApiResponse(successResponse.data, schema);
      if (!dataValidation.success) {
        const errorMessage =
          "error" in dataValidation
            ? dataValidation.error
            : "Unknown validation error";
        throw new ValidationError(`Invalid response data: ${errorMessage}`);
      }
      successResponse.data = dataValidation.data;
    }

    return successResponse;
  }

  private handleErrorResponse(status: number, data: unknown): never {
    // Try to parse as API error response
    const errorValidation = validateApiResponse(data, ApiErrorResponseSchema);

    if (errorValidation.success) {
      throw this.createErrorFromResponse(errorValidation.data);
    }

    // Fallback to HTTP status-based errors
    switch (status) {
      case 401:
        throw new AuthenticationError("Authentication required");
      case 403:
        throw new AuthorizationError("Access forbidden");
      case 404:
        throw new NotFoundError("Resource not found");
      default:
        throw new NetworkError(`HTTP ${status}: Request failed`);
    }
  }

  private createErrorFromResponse(errorResponse: ApiErrorResponse): AppError {
    const { error } = errorResponse;

    switch (error.code) {
      case "VALIDATION_ERROR":
        return new ValidationError(error.message, undefined, error.details);
      case "AUTHENTICATION_ERROR":
        return new AuthenticationError(error.message, error.details);
      case "AUTHORIZATION_ERROR":
        return new AuthorizationError(error.message, error.details);
      case "NOT_FOUND_ERROR":
        return new NotFoundError(error.message, error.details);
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
    const maxAttempts = (config.retries ?? this.retries) + 1;

    // Apply request interceptors
    const processedConfig = await this.applyRequestInterceptors(config);

    while (attempt < maxAttempts) {
      try {
        logApiCall(processedConfig.method || "GET", url, undefined, {
          attempt: attempt + 1,
        });

        const response = await this.executeRequest(url, processedConfig);
        const apiResponse = await this.handleResponse<T>(response, schema);

        logApiCall(processedConfig.method || "GET", url, response.status);

        // Apply response interceptors
        const processedResponse =
          await this.applyResponseInterceptors(apiResponse);

        return processedResponse;
      } catch (error) {
        attempt++;
        const normalizedError = normalizeError(error);

        logApiCall(processedConfig.method || "GET", url, undefined, {
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
  async getRaw<T>(endpoint: string, schema?: z.ZodSchema<T>): Promise<{ data: T }>{
    const url = this.createUrl(endpoint);
    const response = await this.executeRequest(url, { method: "GET" });

    let responseData: unknown;
    try {
      responseData = await response.json();
    } catch (error) {
      throw new NetworkError(
        "Invalid JSON response",
        error instanceof Error ? error : undefined,
      );
    }

    if (!response.ok) {
      this.handleErrorResponse(response.status, responseData);
    }

    if (schema) {
      const preprocessed = nullToUndefined ? nullToUndefined(responseData) : responseData;
      const validation = (schema as z.ZodSchema<T>).safeParse(preprocessed);
      if (!validation.success) {
        throw new ValidationError(
          `Invalid response data: ${validation.error.issues.map(i => i.message).join(", ")}`,
        );
      }
      return { data: validation.data };
    }

    return { data: responseData as T };
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
