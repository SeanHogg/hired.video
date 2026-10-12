import { describe, it, expect, beforeEach, vi } from "vitest";
import { ApiClient } from "@/lib/api-client";
import { NetworkError } from "@/lib/errors";
import { API_ERROR_EVENT, type ApiErrorEvent } from "@shared/errors/apiErrorEvent";

// Regression test for the dropped-server-error bug:
//
// The API's globalErrorHandler emits unhandled exceptions as a loose
// `{ error: { code, message, _source } }` envelope WITHOUT a `success: false`
// field. Previously the strict ApiErrorResponseSchema rejected those
// payloads, the client fell through to the HTTP-status switch, and the
// dispatched ApiErrorEvent was just `HTTP 500: Request failed` with code
// NETWORK_ERROR — losing the real backend code, message, and the
// `_source` stack frame that lets SuperAdmin debug.
//
// The fix accepts the loose envelope in handleErrorResponse, preserves
// the server code as `serverCode` in the AppError context, and surfaces
// it on the dispatched event so the dev toast / copy ticket show the
// actual exception.

function mockResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("api-client loose error-envelope handling", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("preserves server code, message, and _source on a loose 500 envelope", async () => {
    // mockResolvedValue (not -Once) so any retry attempt also sees the 500.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockResponse(500, {
        error: {
          code: "INTERNAL_ERROR",
          message: 'relation "offer_letters" does not exist',
          _source: { function: "execute", file: "worker.js", line: 52482, column: 40 },
        },
      }),
    );

    const events: ApiErrorEvent[] = [];
    const handler = (e: Event) => events.push((e as CustomEvent<ApiErrorEvent>).detail);
    window.addEventListener(API_ERROR_EVENT, handler as EventListener);

    const client = new ApiClient({ baseUrl: "https://api.hired.video" });

    let caught: unknown;
    try {
      await client.get("/api/hiring/offers", undefined, { retries: 0 });
    } catch (err) {
      caught = err;
    }

    window.removeEventListener(API_ERROR_EVENT, handler as EventListener);

    // The thrown error should carry the real server message.
    expect(caught).toBeInstanceOf(NetworkError);
    expect((caught as NetworkError).message).toBe('relation "offer_letters" does not exist');
    expect((caught as NetworkError).context).toMatchObject({
      serverCode: "INTERNAL_ERROR",
      _source: { function: "execute", file: "worker.js", line: 52482, column: 40 },
    });

    // The dispatched toast event should show the real server code and
    // message — not the generic "HTTP 500: Request failed" / NETWORK_ERROR.
    expect(events).toHaveLength(1);
    expect(events[0].code).toBe("INTERNAL_ERROR");
    expect(events[0].message).toBe('relation "offer_letters" does not exist');
    expect(events[0].status).toBe(500);
    expect(events[0].details).toMatchObject({
      _source: { function: "execute", file: "worker.js", line: 52482, column: 40 },
    });
  });

  it("captures the body snippet + real status when the response isn't JSON (edge 502/504)", async () => {
    // An HTML error page from the Cloudflare edge — the `.json()` parse fails.
    // The NetworkError must carry the real HTTP status + a snippet of the body
    // (the ray id / page title) instead of collapsing to a fabricated 500 with
    // nothing to debug from. Regression for gap #1936.
    const htmlBody =
      "<html><head><title>502 Bad Gateway</title></head><body>cloudflare ray 8f3a1bcdef</body></html>";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(htmlBody, { status: 502, statusText: "Bad Gateway", headers: { "Content-Type": "text/html" } }),
    );

    const events: ApiErrorEvent[] = [];
    const handler = (e: Event) => events.push((e as CustomEvent<ApiErrorEvent>).detail);
    window.addEventListener(API_ERROR_EVENT, handler as EventListener);

    const client = new ApiClient({ baseUrl: "https://api.hired.video" });

    let caught: unknown;
    try {
      await client.get("/api/resumes/public", undefined, { retries: 0 });
    } catch (err) {
      caught = err;
    }

    window.removeEventListener(API_ERROR_EVENT, handler as EventListener);

    expect(caught).toBeInstanceOf(NetworkError);
    expect((caught as NetworkError).message).toBe("Invalid JSON response");
    expect((caught as NetworkError).context).toMatchObject({
      httpStatus: 502,
      statusText: "Bad Gateway",
    });
    expect(String((caught as NetworkError).context?.bodyText)).toContain("cloudflare ray 8f3a1bcdef");

    // The dispatched event shows the true edge status, not NetworkError's 500.
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe(502);
  });

  it("reports a thrown fetch() (no HTTP response) as a transport failure, not a 500", async () => {
    // Regression for the misleading error reports: when fetch() itself throws
    // (offline, DNS, TLS, CORS preflight, connection refused) the browser never
    // got a response. NetworkError hardcodes statusCode 500, so previously the
    // emailed report read as a server crash. It must instead surface status 0 /
    // NETWORK_UNREACHABLE with the real browser cause folded into the message.
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    const events: ApiErrorEvent[] = [];
    const handler = (e: Event) => events.push((e as CustomEvent<ApiErrorEvent>).detail);
    window.addEventListener(API_ERROR_EVENT, handler as EventListener);

    const client = new ApiClient({ baseUrl: "https://api.hired.video" });

    let caught: unknown;
    try {
      await client.get("/api/resumes/public", undefined, { retries: 0 });
    } catch (err) {
      caught = err;
    }

    window.removeEventListener(API_ERROR_EVENT, handler as EventListener);

    expect(caught).toBeInstanceOf(NetworkError);
    expect((caught as NetworkError).context).toMatchObject({
      transport: true,
      cause: "Failed to fetch",
    });

    expect(events).toHaveLength(1);
    expect(events[0].status).toBe(0);
    expect(events[0].code).toBe("NETWORK_UNREACHABLE");
    expect(events[0].message).toBe("Network request failed: Failed to fetch");
  });

  it("falls back to the raw response body on truly-unrecognized error shapes", async () => {
    // JSON-but-not-error-envelope payload exercises the default branch of
    // handleErrorResponse — the body is preserved on context.responseBody
    // so the dev toast can still show whatever the server emitted.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockResponse(502, { weird: "shape", no: "envelope" }),
    );

    const client = new ApiClient({ baseUrl: "https://api.hired.video" });

    let caught: unknown;
    try {
      await client.get("/api/some/endpoint", undefined, { retries: 0 });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(NetworkError);
    expect((caught as NetworkError).message).toBe("HTTP 502: Request failed");
    expect((caught as NetworkError).context).toMatchObject({
      responseBody: { weird: "shape", no: "envelope" },
    });
  });
});
