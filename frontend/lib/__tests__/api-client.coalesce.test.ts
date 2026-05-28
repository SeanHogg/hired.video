import { describe, it, expect, beforeEach, vi } from "vitest";
import { ApiClient } from "@/lib/api-client";

// Regression test for "Duplicate calls throughout the application":
//
// Several components each call the same user-data hook (useSubscription,
// useCurrentCompanyScope, …) in one render, and every hook instance fired
// its own GET — so the network tab showed N identical
// `GET /api/billing/subscription` / `GET /api/recruit/my-scope` requests.
//
// The fix coalesces concurrent identical GETs at the client: while one is
// in flight, later identical GETs share its promise; the entry is cleared
// on settle (no time-based cache, so freshness is unaffected). Writes are
// never coalesced — they aren't idempotent.

function successResponse(data: unknown): Response {
  return new Response(
    JSON.stringify({ success: true, data, timestamp: new Date().toISOString() }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("api-client in-flight GET coalescing", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("collapses concurrent identical GETs into a single network call", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() =>
        Promise.resolve(successResponse({ isPro: true, planId: "pro" })),
      );

    const client = new ApiClient({ baseUrl: "https://api.hired.video" });

    const [r1, r2, r3] = await Promise.all([
      client.get("/api/billing/subscription"),
      client.get("/api/billing/subscription"),
      client.get("/api/billing/subscription"),
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(r1.data).toEqual({ isPro: true, planId: "pro" });
    expect(r2.data).toEqual(r1.data);
    expect(r3.data).toEqual(r1.data);
  });

  it("does not cache across settled requests — a later GET refetches", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() =>
        Promise.resolve(successResponse({ primaryCompanyId: null, companies: [] })),
      );

    const client = new ApiClient({ baseUrl: "https://api.hired.video" });

    await client.get("/api/recruit/my-scope");
    await client.get("/api/recruit/my-scope");

    // The first settled before the second started, so coalescing can't apply
    // — each gets a fresh round-trip (no stale-cache regression).
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("keys on URL — different endpoints are not coalesced together", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => Promise.resolve(successResponse({ ok: true })));

    const client = new ApiClient({ baseUrl: "https://api.hired.video" });

    await Promise.all([
      client.get("/api/billing/subscription"),
      client.get("/api/recruit/my-scope"),
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("never coalesces non-idempotent writes (concurrent POSTs each fire)", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => Promise.resolve(successResponse({ id: "x" })));

    const client = new ApiClient({ baseUrl: "https://api.hired.video" });

    await Promise.all([
      client.post("/api/recruit/shares", { candidateResumeId: "a" }),
      client.post("/api/recruit/shares", { candidateResumeId: "a" }),
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
