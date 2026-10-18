/**
 * Unit tests for the isolate-only read-through cache (utils/isolate-cache.ts):
 * hits, single-flight, null results being cached (negative caching for
 * crawler 404s), `shouldCache` opting a value out, invalidation, and that it
 * never touches KV.
 *
 * Run: node --import tsx --test src/utils/__tests__/isolate-cache.test.ts
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  getOrSetIsolateCached,
  invalidateIsolateKey,
  invalidateIsolatePrefix,
  __resetIsolateCacheForTests,
} from "../isolate-cache.js";

type EnvHolder = { __ENV?: Record<string, unknown> };

describe("getOrSetIsolateCached", () => {
  beforeEach(() => __resetIsolateCacheForTests());
  afterEach(() => {
    delete (globalThis as EnvHolder).__ENV;
  });

  it("serves a repeat read without re-running the loader, and shares one in-flight load", async () => {
    let calls = 0;
    const loader = async () => ++calls;
    const [a, b] = await Promise.all([
      getOrSetIsolateCached({ key: "iso:1", ttlSeconds: 60, loader }),
      getOrSetIsolateCached({ key: "iso:1", ttlSeconds: 60, loader }),
    ]);
    assert.equal(a, 1);
    assert.equal(b, 1);
    assert.equal(await getOrSetIsolateCached({ key: "iso:1", ttlSeconds: 60, loader }), 1);
    assert.equal(calls, 1);
  });

  it("caches a null result (repeat 404s skip the database)", async () => {
    let calls = 0;
    const loader = async (): Promise<string | null> => {
      calls += 1;
      return null;
    };
    await getOrSetIsolateCached({ key: "iso:null", ttlSeconds: 300, loader });
    await getOrSetIsolateCached({ key: "iso:null", ttlSeconds: 300, loader });
    assert.equal(calls, 1);
  });

  it("keeps a value out of the cache when shouldCache says no (still returned)", async () => {
    let calls = 0;
    const loader = async () => {
      calls += 1;
      return { pending: true };
    };
    const opts = { key: "iso:pending", ttlSeconds: 60, loader, shouldCache: (v: { pending: boolean }) => !v.pending };
    assert.deepEqual(await getOrSetIsolateCached(opts), { pending: true });
    await getOrSetIsolateCached(opts);
    assert.equal(calls, 2);
  });

  it("invalidates one key, or every key under a prefix", async () => {
    let calls = 0;
    const loader = async () => ++calls;
    await getOrSetIsolateCached({ key: "u:1:a", ttlSeconds: 60, loader });
    await getOrSetIsolateCached({ key: "u:1:b", ttlSeconds: 60, loader });
    invalidateIsolateKey("u:1:a");
    assert.equal(await getOrSetIsolateCached({ key: "u:1:a", ttlSeconds: 60, loader }), 3);
    invalidateIsolatePrefix("u:1:");
    assert.equal(await getOrSetIsolateCached({ key: "u:1:b", ttlSeconds: 60, loader }), 4);
  });

  it("does not cache a loader failure (error case)", async () => {
    await assert.rejects(
      getOrSetIsolateCached({ key: "iso:err", ttlSeconds: 60, loader: async () => Promise.reject(new Error("db down")) }),
    );
    assert.equal(await getOrSetIsolateCached({ key: "iso:err", ttlSeconds: 60, loader: async () => "ok" }), "ok");
  });

  it("never touches KV, even when the binding is present", async () => {
    let kvCalls = 0;
    const touch = async () => {
      kvCalls += 1;
      return null;
    };
    (globalThis as EnvHolder).__ENV = { KV_CACHE: { get: touch, put: touch, delete: touch } };
    await getOrSetIsolateCached({ key: "iso:kv", ttlSeconds: 60, loader: async () => 1 });
    invalidateIsolateKey("iso:kv");
    assert.equal(kvCalls, 0);
  });
});
