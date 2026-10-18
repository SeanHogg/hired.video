/**
 * checkRateLimit tests (#1828) — the best-effort, isolate-local fixed-window
 * limiter behind the embed data API. Verifies it allows up to `limit` hits per
 * window, blocks past it (with a Retry-After), isolates dimensions, and never
 * writes KV (Workers Free write budget is reserved for scheduler markers).
 *
 * Run: node --import tsx --test src/utils/__tests__/rate-limit.test.ts
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { checkRateLimit, __resetRateLimitForTests } from "../rate-limit.js";

type EnvHolder = { __ENV?: Record<string, unknown> };

describe("checkRateLimit", () => {
  beforeEach(() => {
    __resetRateLimitForTests();
  });
  afterEach(() => {
    delete (globalThis as EnvHolder).__ENV;
  });

  it("allows up to the limit, then blocks with a Retry-After", async () => {
    const dim = "test:allow-then-block";
    const r1 = await checkRateLimit(dim, 3, 60);
    assert.equal(r1.allowed, true);
    assert.equal(r1.remaining, 2);
    await checkRateLimit(dim, 3, 60); // 2nd
    await checkRateLimit(dim, 3, 60); // 3rd — now at limit
    const blocked = await checkRateLimit(dim, 3, 60); // 4th
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remaining, 0);
    assert.ok(blocked.retryAfterSeconds > 0 && blocked.retryAfterSeconds <= 60);
  });

  it("isolates dimensions (one key's burst doesn't throttle another)", async () => {
    await checkRateLimit("test:a", 1, 60);
    const a = await checkRateLimit("test:a", 1, 60);
    const b = await checkRateLimit("test:b", 1, 60);
    assert.equal(a.allowed, false);
    assert.equal(b.allowed, true);
  });

  it("never touches KV, even when the binding is present", async () => {
    let kvCalls = 0;
    const touch = async () => {
      kvCalls += 1;
      return null;
    };
    (globalThis as EnvHolder).__ENV = { KV_CACHE: { get: touch, put: touch, delete: touch } };
    for (let i = 0; i < 5; i++) await checkRateLimit("test:no-kv", 10, 60);
    assert.equal(kvCalls, 0);
  });

  it("a limit of 0 blocks immediately (boundary)", async () => {
    const r = await checkRateLimit("test:zero", 0, 60);
    assert.equal(r.allowed, false);
  });
});
