/**
 * Raw requests: endpoints that do NOT use the common `{ success, data }`
 * envelope. Same logging, error mapping and global error event as the
 * envelope path; the body is returned as-is (optionally schema-validated).
 */
import type { z } from "zod";
import { normalizeError } from "../errors";
import { emitApiError } from "./error-events";
import { handleErrorResponse } from "./error-mapping";
import { parseRawData, readJsonBody } from "./envelope";
import {
  nextLogId,
  pushApiLogEntry,
  recordLogEntryError,
  recordLogEntryResponse,
} from "./request-log";
import { requestIdOf } from "./transport";
import type { RequestConfig, RequestPipeline } from "./types";

export async function requestRawBody<T>(
  pipeline: RequestPipeline,
  url: string,
  config: RequestConfig,
  schema: z.ZodSchema<T> | undefined,
  /** requestRaw runs the request interceptors (e.g. Authorization header
   *  injection); getRaw historically does not. */
  applyInterceptors: boolean,
): Promise<{ data: T }> {
  const logId = nextLogId();
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
    const processedConfig = applyInterceptors
      ? await pipeline.applyRequestInterceptors(config)
      : config;

    const response = await pipeline.execute(url, processedConfig);
    lastRequestId = requestIdOf(response);

    const responseData = await readJsonBody(response);

    recordLogEntryResponse(logId, response.status, responseData, startTime);

    if (!response.ok) {
      handleErrorResponse(response.status, responseData);
    }

    return parseRawData<T>(responseData, schema);
  } catch (error) {
    const normalized = normalizeError(error);
    recordLogEntryError(logId, normalized.message, startTime);

    emitApiError(
      normalized,
      { method, url, requestId: lastRequestId },
      config.suppressErrorEvent,
    );

    throw error;
  }
}
