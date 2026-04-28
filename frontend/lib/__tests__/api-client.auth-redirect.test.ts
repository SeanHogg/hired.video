import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ApiClient } from "@/lib/api-client";
import { AuthenticationError } from "@/lib/errors";

// Regression test for the public-page redirect bug:
//
// Before the fix, ANY 401 from the API client cleared localStorage and
// redirected to "/" (or to "/login" via the default onError interceptor).
// That meant a public page like /resumes/<id> — which fires auxiliary
// auth-required calls (analytics, owner-only metadata, etc.) — bounced
// every anonymous viewer to the login screen, even when the resume
// itself was public and loaded successfully.
//
// The fix gates the logout/redirect behind "did the caller actually
// have a token?" — i.e. only treat the 401 as session invalidation
// when there was a session to invalidate. Anonymous callers get a
// clean AuthenticationError that the page can swallow.

function mockResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("api-client 401 handling", () => {
  let originalLocation: Location;
  let replaceMock: ReturnType<typeof vi.fn>;
  let hrefSetter: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.spyOn(window, "dispatchEvent");

    // Stub window.location so we can assert against navigation without
    // actually navigating the test runner. window.location is read-only,
    // so we replace the descriptor.
    originalLocation = window.location;
    replaceMock = vi.fn();
    hrefSetter = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...originalLocation,
        replace: replaceMock,
        get href() {
          return originalLocation.href;
        },
        set href(value: string) {
          hrefSetter(value);
        },
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("does NOT redirect or clear storage when an anonymous caller hits a 401", async () => {
    // No auth_token in localStorage — caller is anonymous.
    expect(localStorage.getItem("auth_token")).toBeNull();

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockResponse(401, { error: { code: "UNAUTHORIZED", message: "Missing token" } }),
    );

    const client = new ApiClient({ baseUrl: "https://api.hired.video" });

    await expect(client.get("/api/some/auth-required-endpoint")).rejects.toBeInstanceOf(
      AuthenticationError,
    );

    // Critical: no redirect, no event dispatch, no storage manipulation.
    vi.runAllTimers();
    expect(replaceMock).not.toHaveBeenCalled();
    expect(hrefSetter).not.toHaveBeenCalled();
    expect(window.dispatchEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "auth-logout" }),
    );
  });

  it("maps a structured 401 UNAUTHORIZED envelope to AuthenticationError (not NetworkError)", async () => {
    // Real backend bodies are `{success: false, error: {code: "UNAUTHORIZED", ...}}`.
    // Without `success: false` the schema rejects and we fall through to the
    // HTTP-status switch, which is already correct. This test covers the
    // structured-envelope path — where a missing `UNAUTHORIZED` case in
    // createErrorFromResponse used to surface bad-credential responses as
    // NetworkError (statusCode 500), spawning a "system exception" toast on
    // the login page.
    expect(localStorage.getItem("auth_token")).toBeNull();

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockResponse(401, {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Invalid email or password" },
        timestamp: new Date().toISOString(),
      }),
    );

    const client = new ApiClient({ baseUrl: "https://api.hired.video" });

    await expect(
      client.post("/api/auth/login", { email: "x@y.z", password: "wrong" }),
    ).rejects.toBeInstanceOf(AuthenticationError);

    vi.runAllTimers();
    expect(replaceMock).not.toHaveBeenCalled();
    expect(hrefSetter).not.toHaveBeenCalled();
  });

  it("DOES clear storage and redirect when an authenticated caller hits a 401", async () => {
    // Caller had a session that just got invalidated.
    localStorage.setItem("auth_token", "stale.jwt.value");
    localStorage.setItem("current_user", JSON.stringify({ id: "u1" }));

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockResponse(401, { error: { code: "UNAUTHORIZED", message: "Token expired" } }),
    );

    const client = new ApiClient({ baseUrl: "https://api.hired.video" });

    await expect(client.get("/api/some/auth-required-endpoint")).rejects.toBeInstanceOf(
      AuthenticationError,
    );

    // The session-invalidation path fires.
    expect(localStorage.getItem("auth_token")).toBeNull();
    expect(localStorage.getItem("current_user")).toBeNull();

    // The auth-logout event was dispatched.
    expect(window.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "auth-logout" }),
    );

    // The home redirect fires after the 100ms setTimeout.
    vi.advanceTimersByTime(150);
    expect(replaceMock).toHaveBeenCalledWith("/");
  });
});
