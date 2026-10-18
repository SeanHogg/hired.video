/**
 * Unit tests for the canonical edge cache (utils/edge-cache.ts).
 *
 * Covers single-flight (concurrent misses share one loader), loader
 * failures not being cached, invalidation, negative caching (null never
 * written to KV), and version tokens (L1-cached reads, coalesced bumps)
 * against a fake KV binding.
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
  const ops = { gets: 0, puts: 0 };
  return {
    store,
    ops,
    async get(key: string, type?: string) {
      ops.gets += 1;
      const raw = store.get(key);
      if (raw === undefined) return null;
      return type === "json" ? JSON.parse(raw) : raw;
    },
    async put(key: string, value: string) {
      ops.puts += 1;
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

describe("negative caching", () => {
  beforeEach(() => {
    __resetEdgeCacheForTests();
  });
  afterEach(() => {
    (globalThis as any).__ENV = {};
  });

  it("serves a null result from L1 without re-running the loader, and never writes it to KV", async () => {
    const kv = fakeKv();
    (globalThis as any).__ENV = { KV_CACHE: kv };
    let calls = 0;
    const loader = async (): Promise<{ title: string } | null> => {
      calls += 1;
      return null; // e.g. a crawler 404 on an unknown OG id
    };
    assert.equal(await getOrSetCached({ key: "og:missing", ttlSeconds: 600, loader }), null);
    assert.equal(await getOrSetCached({ key: "og:missing", ttlSeconds: 600, loader }), null);
    await flush();
    assert.equal(calls, 1);
    assert.equal(kv.ops.puts, 0, "a null is never a KV write");
  });

  it("invalidation clears a negative entry (the entity now exists)", async () => {
    (globalThis as any).__ENV = {};
    await getOrSetCached({ key: "neg:2", ttlSeconds: 600, loader: async () => null });
    invalidateCachedKey("neg:2");
    assert.deepEqual(
      await getOrSetCached({ key: "neg:2", ttlSeconds: 600, loader: async () => ({ ok: true }) }),
      { ok: true },
    );
  });
});

describe("version tokens", () => {
  beforeEach(() => {
    __resetEdgeCacheForTests();
  });
  afterEach(() => {
    (globalThis as any).__ENV = {};
  });

  it("serves repeat reads from L1 — one KV GET, not one per request", async () => {
    const kv = fakeKv();
    (globalThis as any).__ENV = { KV_CACHE: kv };
    kv.store.set("cachever:ns-l1", "t1");
    assert.equal(await getCacheVersion("ns-l1"), "t1");
    assert.equal(await getCacheVersion("ns-l1"), "t1");
    assert.equal(kv.ops.gets, 1);
  });

  it("coalesces a burst of bumps into one KV write, yet each bump is visible locally at once", async () => {
    const kv = fakeKv();
    (globalThis as any).__ENV = { KV_CACHE: kv };
    const seen = new Set<string>();
    seen.add(await getCacheVersion("ns-burst"));
    for (let i = 0; i < 5; i++) {
      bumpCacheVersion("ns-burst");
      seen.add(await getCacheVersion("ns-burst"));
    }
    await flush();
    assert.equal(seen.size, 6, "every bump rotated the local token");
    assert.equal(kv.ops.puts, 1, "only the first bump in the window wrote KV");
  });

  it("without KV a bump still rotates the local token (dev / tests)", async () => {
    (globalThis as any).__ENV = {};
    const before = await getCacheVersion("ns-nokv");
    bumpCacheVersion("ns-nokv");
    assert.notEqual(await getCacheVersion("ns-nokv"), before);
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
