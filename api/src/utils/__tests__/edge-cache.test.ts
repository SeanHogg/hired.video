/**
 * Unit tests for the canonical edge cache (utils/edge-cache.ts).
 *
 * Covers single-flight (concurrent misses share one loader), loader
 * failures not being cached, invalidation, and version tokens against a
 * fake KV binding.
 *
 * Run: node --import tsx --test src/utils/__tests__/edge-cache.test.ts
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  getOrSetCached,
  invalidateCachedKey,
  getCacheVersion,
  bumpCacheVersion,
  __resetEdgeCacheForTests,
} from "../edge-cache.js";

function fakeKv() {
  const store = new Map<string, string>();
  return {
    store,
    async get(key: string, type?: string) {
      const raw = store.get(key);
      if (raw === undefined) return null;
      return type === "json" ? JSON.parse(raw) : raw;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  };
}

const flush = () => new Promise<void>((r) => setImmediate(r));

describe("getOrSetCached", () => {
  beforeEach(() => {
    __resetEdgeCacheForTests();
    (globalThis as any).__ENV = {};
  });

  it("runs the loader once for concurrent misses (single-flight)", async () => {
    let calls = 0;
    let release!: (v: number) => void;
    const gate = new Promise<number>((r) => (release = r));
    const loader = async () => {
      calls += 1;
      return gate;
    };
    const a = getOrSetCached({ key: "sf:1", ttlSeconds: 60, loader });
    const b = getOrSetCached({ key: "sf:1", ttlSeconds: 60, loader });
    release(42);
    assert.deepEqual(await Promise.all([a, b]), [42, 42]);
    assert.equal(calls, 1);
  });

  it("serves the L1 copy on a repeat read", async () => {
    let calls = 0;
    const loader = async () => ++calls;
    await getOrSetCached({ key: "l1:1", ttlSeconds: 60, loader });
    assert.equal(await getOrSetCached({ key: "l1:1", ttlSeconds: 60, loader }), 1);
    assert.equal(calls, 1);
  });

  it("does not cache a loader failure", async () => {
    let calls = 0;
    const failing = async () => {
      calls += 1;
      throw new Error("boom");
    };
    await assert.rejects(getOrSetCached({ key: "err:1", ttlSeconds: 60, loader: failing }));
    const value = await getOrSetCached({ key: "err:1", ttlSeconds: 60, loader: async () => "ok" });
    assert.equal(value, "ok");
    assert.equal(calls, 1);
  });

  it("re-runs the loader after invalidateCachedKey", async () => {
    let calls = 0;
    const loader = async () => ++calls;
    await getOrSetCached({ key: "inv:1", ttlSeconds: 60, loader });
    invalidateCachedKey("inv:1");
    assert.equal(await getOrSetCached({ key: "inv:1", ttlSeconds: 60, loader }), 2);
  });

  it("does not cache a load that was invalidated while in flight", async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const stale = getOrSetCached({
      key: "race:1",
      ttlSeconds: 60,
      loader: async () => {
        calls += 1;
        await gate;
        return "stale";
      },
    });
    // e.g. a session revoke lands while the read is still in flight
    invalidateCachedKey("race:1");
    release();
    assert.equal(await stale, "stale");
    const fresh = await getOrSetCached({
      key: "race:1",
      ttlSeconds: 60,
      loader: async () => {
        calls += 1;
        return "fresh";
      },
    });
    assert.equal(fresh, "fresh");
    assert.equal(calls, 2);
  });

  it("falls back to L2 (KV) after L1 is cleared", async () => {
    const kv = fakeKv();
    (globalThis as any).__ENV = { KV_CACHE: kv };
    await getOrSetCached({ key: "kv:1", ttlSeconds: 60, loader: async () => ({ n: 7 }) });
    await flush();
    assert.equal(kv.store.get("kv:1"), JSON.stringify({ n: 7 }));
    __resetEdgeCacheForTests();
    let calls = 0;
    const value = await getOrSetCached({
      key: "kv:1",
      ttlSeconds: 60,
      loader: async () => {
        calls += 1;
        return { n: 0 };
      },
    });
    assert.deepEqual(value, { n: 7 });
    assert.equal(calls, 0);
  });
});

describe("version tokens", () => {
  afterEach(() => {
    (globalThis as any).__ENV = {};
  });

  it('defaults to "0" without a KV binding', async () => {
    (globalThis as any).__ENV = {};
    assert.equal(await getCacheVersion("ns"), "0");
  });

  it("changes the token on bump", async () => {
    const kv = fakeKv();
    (globalThis as any).__ENV = { KV_CACHE: kv };
    const before = await getCacheVersion("ns");
    bumpCacheVersion("ns");
    await flush();
    const after = await getCacheVersion("ns");
    assert.notEqual(before, after);
  });
});
