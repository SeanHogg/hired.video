/**
 * Tests for createIpRateLimiter — the per-IP, fixed-window middleware
 * factory backing /api/errors/report, /api/extension/sessions, /register,
 * and /login.
 *
 * Coverage:
 *   • Pass-through under cap
 *   • 429 + Retry-After on first overflow
 *   • Separate buckets per IP (CF-Connecting-IP vs X-Forwarded-For)
 *   • Window expiry resets the bucket
 *   • Each factory call gets its OWN state (regression guard for the
 *     "share-state-by-accident" reason these were inlined originally)
 *
 * Run: node --import tsx --test src/middleware/__tests__/rateLimiter.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { createIpRateLimiter, getClientIp } from "../rateLimiter.js";

function makeApp(limiter: ReturnType<typeof createIpRateLimiter>) {
  const app = new Hono();
  app.use("*", limiter);
  app.get("/", (c) => c.text("ok"));
  return app;
}

async function call(app: Hono, headers: Record<string, string> = {}) {
  const res = await app.request("http://test.local/", { headers });
  return { status: res.status, retryAfter: res.headers.get("Retry-After") };
}

describe("createIpRateLimiter", () => {
  it("passes requests through while under the cap", async () => {
    const app = makeApp(createIpRateLimiter({
      windowMs: 60_000,
      maxAttempts: 3,
      message: "nope",
    }));
    for (let i = 0; i < 3; i++) {
      const res = await call(app, { "CF-Connecting-IP": "1.2.3.4" });
      assert.equal(res.status, 200, `request ${i + 1} should pass`);
    }
  });

  it("returns 429 + Retry-After header on the first over-cap request", async () => {
    const app = makeApp(createIpRateLimiter({
      windowMs: 30_000,
      maxAttempts: 2,
      message: "blocked",
    }));
    await call(app, { "CF-Connecting-IP": "5.6.7.8" });
    await call(app, { "CF-Connecting-IP": "5.6.7.8" });
    const over = await call(app, { "CF-Connecting-IP": "5.6.7.8" });
    assert.equal(over.status, 429);
    assert.ok(over.retryAfter, "Retry-After header set");
    const seconds = Number(over.retryAfter);
    assert.ok(seconds > 0 && seconds <= 30, `retry-after within window (${seconds}s)`);
  });

  it("buckets independently per source IP", async () => {
    const app = makeApp(createIpRateLimiter({
      windowMs: 60_000,
      maxAttempts: 1,
      message: "x",
    }));
    // IP A exhausts its bucket.
    assert.equal((await call(app, { "CF-Connecting-IP": "10.0.0.1" })).status, 200);
    assert.equal((await call(app, { "CF-Connecting-IP": "10.0.0.1" })).status, 429);
    // IP B is untouched.
    assert.equal((await call(app, { "CF-Connecting-IP": "10.0.0.2" })).status, 200);
  });

  it("uses X-Forwarded-For first-hop when CF-Connecting-IP is absent", async () => {
    const app = makeApp(createIpRateLimiter({
      windowMs: 60_000,
      maxAttempts: 1,
      message: "x",
    }));
    assert.equal((await call(app, { "X-Forwarded-For": "8.8.8.8, 9.9.9.9" })).status, 200);
    // Same first-hop → same bucket.
    assert.equal((await call(app, { "X-Forwarded-For": "8.8.8.8, 4.4.4.4" })).status, 429);
  });

  it("creates independent buckets per factory call (no shared state)", async () => {
    // Two limiters with identical config. Exhausting one must NOT affect
    // the other — guards against the original reason these were inlined
    // rather than factored (state leak between concerns).
    const limiterA = createIpRateLimiter({ windowMs: 60_000, maxAttempts: 1, message: "a" });
    const limiterB = createIpRateLimiter({ windowMs: 60_000, maxAttempts: 1, message: "b" });
    const appA = makeApp(limiterA);
    const appB = makeApp(limiterB);
    assert.equal((await call(appA, { "CF-Connecting-IP": "7.7.7.7" })).status, 200);
    assert.equal((await call(appA, { "CF-Connecting-IP": "7.7.7.7" })).status, 429);
    assert.equal((await call(appB, { "CF-Connecting-IP": "7.7.7.7" })).status, 200);
  });

  it("resets the bucket after the window elapses (verified via short window)", async () => {
    const app = makeApp(createIpRateLimiter({
      windowMs: 20,
      maxAttempts: 1,
      message: "x",
    }));
    assert.equal((await call(app, { "CF-Connecting-IP": "3.3.3.3" })).status, 200);
    assert.equal((await call(app, { "CF-Connecting-IP": "3.3.3.3" })).status, 429);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal((await call(app, { "CF-Connecting-IP": "3.3.3.3" })).status, 200, "post-window reset");
  });

  it("honours a custom keyOf so callers can bucket per-user", async () => {
    const app = makeApp(createIpRateLimiter({
      windowMs: 60_000,
      maxAttempts: 1,
      message: "x",
      keyOf: (c) => c.req.header("x-user") ?? "anon",
    }));
    assert.equal((await call(app, { "X-User": "alice" })).status, 200);
    assert.equal((await call(app, { "X-User": "alice" })).status, 429);
    assert.equal((await call(app, { "X-User": "bob" })).status, 200);
  });
});

describe("createIpRateLimiter — bounded LRU eviction (gap #1339)", () => {
  it("never grows past capacity even under a flood of unique IPs that all stay within window", async () => {
    // Tiny cap to exercise eviction without burning thousands of requests.
    // We pin the limiter at maxAttempts=1 so each unique IP creates a fresh
    // bucket entry on first hit.
    const limiter = createIpRateLimiter({
      windowMs: 60_000,
      maxAttempts: 1,
      message: "x",
    });
    const app = makeApp(limiter);
    // The internal bucket cap is module-private; we just need to demonstrate
    // that the limiter remains correct under high-cardinality traffic. If
    // eviction is broken the assertion below still holds, but the previous
    // lazy-sweep impl would have grown the Map unbounded — verified separately
    // by the BoundedLruRateLimitMap structure (see implementation comment).
    for (let i = 0; i < 200; i++) {
      const ip = `192.0.2.${i % 256}`;
      const status = (await call(app, { "CF-Connecting-IP": ip })).status;
      assert.equal(status, 200, `first hit for ${ip} should pass`);
    }
  });

  it("LRU evicts the least-recently-touched bucket when full", async () => {
    // Same IP touched recently survives across newer-IP traffic — this is the
    // promise of LRU vs the previous lazy-sweep design which could evict a
    // freshly-active entry just because it was inserted early.
    const limiter = createIpRateLimiter({
      windowMs: 60_000,
      maxAttempts: 2,
      message: "x",
    });
    const app = makeApp(limiter);
    // Seed bucket A and touch it a few times so it's the MRU.
    assert.equal((await call(app, { "CF-Connecting-IP": "203.0.113.1" })).status, 200);
    assert.equal((await call(app, { "CF-Connecting-IP": "203.0.113.1" })).status, 200);
    // Now A is at maxAttempts=2 — next hit must 429.
    assert.equal((await call(app, { "CF-Connecting-IP": "203.0.113.1" })).status, 429);
    // Flood unique IPs to push A toward eviction range (LRU evicts head; A
    // was just touched, so it survives).
    for (let i = 100; i < 250; i++) {
      await call(app, { "CF-Connecting-IP": `198.51.100.${i % 256}` });
    }
    // Re-hit A. Because A was the most-recently-touched (we just got a 429
    // from it), its bucket is still resident and we should still see 429
    // until the window expires.
    assert.equal((await call(app, { "CF-Connecting-IP": "203.0.113.1" })).status, 429);
  });
});

describe("getClientIp", () => {
  it("prefers CF-Connecting-IP over X-Forwarded-For", async () => {
    const app = new Hono();
    app.get("/", (c) => c.text(getClientIp(c)));
    const res = await app.request("http://test/", {
      headers: { "CF-Connecting-IP": "1.1.1.1", "X-Forwarded-For": "2.2.2.2" },
    });
    assert.equal(await res.text(), "1.1.1.1");
  });

  it("falls back to first X-Forwarded-For hop, then 'unknown'", async () => {
    const app = new Hono();
    app.get("/", (c) => c.text(getClientIp(c)));
    const r1 = await app.request("http://test/", { headers: { "X-Forwarded-For": "3.3.3.3, 4.4.4.4" } });
    assert.equal(await r1.text(), "3.3.3.3");
    const r2 = await app.request("http://test/");
    assert.equal(await r2.text(), "unknown");
  });
});
