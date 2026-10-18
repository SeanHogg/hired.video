/**
 * The public-projects cache (#274/#275): one loader call per subject while
 * warm; invalidating a subject orphans ONLY its entry.
 *
 * Run: node --import tsx --test src/services/studio/__tests__/public-projects-cache.test.ts
 */
import { beforeEach, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { __resetEdgeCacheForTests } from "../../../utils/edge-cache.js";
import { __resetIsolateCacheForTests } from "../../../utils/isolate-cache.js";
import { getPublicProjectsCached, invalidatePublicProjectsForSubjects } from "../public-projects-cache.js";

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

const JOB = { kind: "job", id: "4f1c9a2b-7e3d-4c8a-b6f0-1d2e3a4b5c6d" };
const COMPANY = { kind: "company", id: "c7a1e5d3-2b4f-4a6c-8e9d-0f1a2b3c4d5e" };

let kv: ReturnType<typeof fakeKv>;

describe("public projects cache", () => {
  beforeEach(() => {
    __resetEdgeCacheForTests();
    __resetIsolateCacheForTests();
    kv = fakeKv();
    (globalThis as any).__ENV = { KV_CACHE: kv };
  });

  it("serves a warm subject without re-running the loader", async () => {
    let calls = 0;
    const loader = async () => {
      calls++;
      return [{ id: "p1", isPublic: true }];
    };
    assert.deepEqual(await getPublicProjectsCached(JOB, loader), [{ id: "p1", isPublic: true }]);
    await getPublicProjectsCached(JOB, loader);
    assert.equal(calls, 1);
  });

  it("invalidating a subject reloads it, and only it", async () => {
    let jobCalls = 0;
    let companyCalls = 0;
    await getPublicProjectsCached(JOB, async () => (jobCalls++, []));
    await getPublicProjectsCached(COMPANY, async () => (companyCalls++, []));
    // Invalidation clears this isolate's entry synchronously.
    invalidatePublicProjectsForSubjects([JOB, JOB]);
    await getPublicProjectsCached(JOB, async () => (jobCalls++, [{ id: "p2" }]));
    await getPublicProjectsCached(COMPANY, async () => (companyCalls++, []));
    assert.equal(jobCalls, 2);
    assert.equal(companyCalls, 1);
  });

  it("never writes KV — neither a fill nor an invalidation (Workers Free quota)", async () => {
    await getPublicProjectsCached(JOB, async () => []);
    invalidatePublicProjectsForSubjects([JOB]);
    await getPublicProjectsCached(JOB, async () => []);
    assert.equal(kv.store.size, 0);
  });

  it("a failed load is not cached (error case)", async () => {
    await assert.rejects(getPublicProjectsCached(JOB, async () => Promise.reject(new Error("db down"))));
    assert.deepEqual(await getPublicProjectsCached(JOB, async () => []), []);
  });
});
