/**
 * Streamed responses (SSE / NDJSON / fetch streaming). Opens the stream with
 * the same auth, logging and error mapping as the envelope path; the body is
 * the caller's to read.
 */
import { normalizeError } from "../errors";
import { emitApiError } from "./error-events";
import { handleErrorResponse } from "./error-mapping";
import { readJsonBody } from "./envelope";
import {
  nextLogId,
  pushApiLogEntry,
  recordLogEntryError,
  recordLogEntryResponse,
} from "./request-log";
import { requestIdOf } from "./transport";
import type { RequestConfig, RequestPipeline } from "./types";

/**
 * Open a streamed response (SSE / NDJSON) with the same auth, logging and
 * error mapping as `request`. `config.timeout` bounds only the wait for
 * the response HEADERS; the body is the caller's to read (and to put an
 * idle deadline on). A non-2xx response throws the usual typed error.
 */
export async function openStreamRequest(
  pipeline: RequestPipeline,
  url: string,
  config: RequestConfig,
): Promise<Response> {
  const logId = nextLogId();
  const startTime = Date.now();
  const method = config.method || "GET";
  pushApiLogEntry({ id: logId, method, url, requestBody: config.body, timestamp: new Date().toISOString() });

  let lastRequestId: string | undefined;
  try {
    const response = await pipeline.execute(url, await pipeline.applyRequestInterceptors(config));
    lastRequestId = requestIdOf(response);
    if (!response.ok) {
      const responseData = await readJsonBody(response);
      recordLogEntryResponse(logId, response.status, responseData, startTime);
      handleErrorResponse(response.status, responseData);
    }
    recordLogEntryResponse(logId, response.status, undefined, startTime);
    return response;
  } catch (error) {
    const normalized = normalizeError(error);
    recordLogEntryError(logId, normalized.message, startTime);
    emitApiError(normalized, { method, url, requestId: lastRequestId }, config.suppressErrorEvent);
    throw normalized;
  }
}
