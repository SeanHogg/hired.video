/**
 * Ordered request / response / error interceptor chains. Each chain runs its
 * interceptors sequentially, feeding each the previous one's output.
 */
import type { ApiSuccessResponse } from "@shared/api";
import type { AppError } from "../errors";
import type {
  ErrorInterceptor,
  RequestConfig,
  RequestInterceptor,
  ResponseInterceptor,
} from "./types";

export class InterceptorChain {
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];
  private errorInterceptors: ErrorInterceptor[] = [];

  addRequest(interceptor: RequestInterceptor): void {
    this.requestInterceptors.push(interceptor);
  }

  addResponse(interceptor: ResponseInterceptor): void {
    this.responseInterceptors.push(interceptor);
  }

  addError(interceptor: ErrorInterceptor): void {
    this.errorInterceptors.push(interceptor);
  }

  async applyRequest(config: RequestConfig): Promise<RequestConfig> {
    let processedConfig = config;

    for (const interceptor of this.requestInterceptors) {
      processedConfig = await interceptor(processedConfig);
    }

    return processedConfig;
  }

  async applyResponse<T>(
    response: ApiSuccessResponse<T>,
  ): Promise<ApiSuccessResponse<T>> {
    let processedResponse = response;

    for (const interceptor of this.responseInterceptors) {
      processedResponse = await interceptor(processedResponse);
    }

    return processedResponse;
  }

  async applyError(error: AppError): Promise<AppError> {
    let processedError = error;

    for (const interceptor of this.errorInterceptors) {
      processedError = await interceptor(processedError);
    }

    return processedError;
  }
}
