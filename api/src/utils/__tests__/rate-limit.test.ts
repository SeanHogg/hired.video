/**
 * checkRateLimit tests (#1828) — the best-effort fixed-window limiter behind
 * the embed data API. Verifies it allows up to `limit` hits per window, blocks
 * past it (with a Retry-After), and no-ops when KV is unbound.
 *
 * Run: node --import tsx --test src/utils/__tests__/rate-limit.test.ts
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { checkRateLimit } from "../rate-limit.js";

function installMockKv() {
  const store = new Map<string, string>();
  (globalThis as any).__ENV = {
    KV_CACHE: {
      get: async (k: string) => store.get(k) ?? null,
      put: async (k: string, v: string) => {
        store.set(k, v);
      },
    },
  };
  return store;
}

describe("checkRateLimit", () => {
  afterEach(() => {
    delete (globalThis as any).__ENV;
  });

  it("allows up to the limit, then blocks with a Retry-After", async () => {
    installMockKv();
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
    installMockKv();
    await checkRateLimit("test:a", 1, 60);
    const a = await checkRateLimit("test:a", 1, 60);
    const b = await checkRateLimit("test:b", 1, 60);
    assert.equal(a.allowed, false);
    assert.equal(b.allowed, true);
  });

  it("no-ops (always allows) when KV is unbound", async () => {
    delete (globalThis as any).__ENV;
    const r = await checkRateLimit("test:no-kv", 1, 60);
    assert.equal(r.allowed, true);
    assert.equal(r.remaining, 1);
  });
});
