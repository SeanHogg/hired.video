/**
 * The public-watch cache (#2394): one loader call per lookup id while
 * warm; bumping an id orphans ONLY its entry.
 *
 * Run: node --import tsx --test src/services/studio/__tests__/public-watch-cache.test.ts
 */
import { beforeEach, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { __resetEdgeCacheForTests } from "../../../utils/edge-cache.js";
import { __resetIsolateCacheForTests } from "../../../utils/isolate-cache.js";
import { bumpPublicWatchCache, getPublicWatchCached } from "../public-watch-cache.js";

/** A minimal in-memory Workers KV (get json / text, put, delete). */
function fakeKv() {
  const store = new Map<string, string>();
  return {
    store,
    async get(key: string, type?: string) {
      const v = store.get(key);
      if (v === undefined) return null;
      return type === "json" ? JSON.parse(v) : v;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  };
}

const PROJECT_ID = "4f1c9a2b-7e3d-4c8a-b6f0-1d2e3a4b5c6d";
const SLUG = "my-video-resume";

let kv: ReturnType<typeof fakeKv>;

describe("public watch cache", () => {
  beforeEach(() => {
    __resetEdgeCacheForTests();
    __resetIsolateCacheForTests();
    kv = fakeKv();
    (globalThis as any).__ENV = { KV_CACHE: kv };
  });

  it("serves a warm lookup without re-running the loader", async () => {
    let calls = 0;
    const loader = async () => {
      calls++;
      return { pending: false, id: PROJECT_ID, title: "Hello" };
    };
    const first = await getPublicWatchCached(PROJECT_ID, loader);
    const second = await getPublicWatchCached(PROJECT_ID, loader);
    assert.deepEqual(first, { pending: false, id: PROJECT_ID, title: "Hello" });
    assert.deepEqual(second, first);
    assert.equal(calls, 1);
  });

  it("bumping a lookup id reloads it, and only it", async () => {
    let projectCalls = 0;
    let slugCalls = 0;
    await getPublicWatchCached(PROJECT_ID, async () => (projectCalls++, { id: PROJECT_ID }));
    await getPublicWatchCached(SLUG, async () => (slugCalls++, { id: SLUG }));
    // Invalidation clears this isolate's entry synchronously.
    bumpPublicWatchCache(PROJECT_ID, PROJECT_ID, null, undefined);
    await getPublicWatchCached(PROJECT_ID, async () => (projectCalls++, { id: "reloaded" }));
    await getPublicWatchCached(SLUG, async () => (slugCalls++, { id: SLUG }));
    assert.equal(projectCalls, 2);
    assert.equal(slugCalls, 1);
  });

  it("bumping every alias of a project orphans each of them", async () => {
    let projectCalls = 0;
    let slugCalls = 0;
    await getPublicWatchCached(PROJECT_ID, async () => (projectCalls++, { via: "id" }));
    await getPublicWatchCached(SLUG, async () => (slugCalls++, { via: "slug" }));
    bumpPublicWatchCache(PROJECT_ID, SLUG);
    await getPublicWatchCached(PROJECT_ID, async () => (projectCalls++, { via: "id-2" }));
    await getPublicWatchCached(SLUG, async () => (slugCalls++, { via: "slug-2" }));
    assert.equal(projectCalls, 2);
    assert.equal(slugCalls, 2);
  });

  it("never writes KV — neither a fill nor an invalidation (Workers Free quota)", async () => {
    await getPublicWatchCached(PROJECT_ID, async () => ({ id: PROJECT_ID }));
    bumpPublicWatchCache(PROJECT_ID, SLUG);
    await getPublicWatchCached(PROJECT_ID, async () => ({ id: PROJECT_ID }));
    assert.equal(kv.store.size, 0);
  });

  it("a failed load is not cached (error case)", async () => {
    await assert.rejects(getPublicWatchCached(PROJECT_ID, async () => Promise.reject(new Error("db down"))));
    assert.deepEqual(await getPublicWatchCached(PROJECT_ID, async () => ({ ok: true })), { ok: true });
  });
});
