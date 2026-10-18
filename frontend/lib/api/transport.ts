/**
 * Fetch transport: one HTTP round-trip with default headers, JSON/FormData
 * body encoding, the client-side timeout + caller abort, the emulation
 * header, and transport-failure (no HTTP response) error mapping.
 */
import { NetworkError } from "../errors";
import { emulationHeaders } from "./auth-token";
import type { RequestConfig } from "./types";

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

/** The `x-request-id` the API stamped on a response, if any. */
export function requestIdOf(response: Response): string | undefined {
  return response.headers.get("x-request-id") ?? undefined;
}

export interface TransportDefaults {
  headers: Record<string, string>;
  timeout: number;
}

export async function executeRequest(
  url: string,
  config: RequestConfig,
  defaults: TransportDefaults,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    config.timeout || defaults.timeout,
  );
  const onCallerAbort = () => controller.abort();
  if (config.signal?.aborted) controller.abort();
  else config.signal?.addEventListener("abort", onCallerAbort, { once: true });

  try {
    // Prepare headers
    const headers = { ...defaults.headers, ...config.headers };

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
    Object.assign(headers, emulationHeaders(url));

    const response = await fetch(url, {
      method: config.method || "GET",
      headers,
      body,
      credentials: "include",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    config.signal?.removeEventListener("abort", onCallerAbort);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    config.signal?.removeEventListener("abort", onCallerAbort);

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
