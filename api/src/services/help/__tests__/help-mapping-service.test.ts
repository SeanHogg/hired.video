/**
 * HelpMappingService tests (v2, slug-keyed meta).
 *
 * Same chainable-Drizzle-stub approach as page-embed-service.test.ts: the
 * service takes its `db` by constructor injection. The service deals only in
 * slugs + meta (content lives in files), so we pin the slug projections +
 * return shapes; the SQL is Drizzle's concern.
 *
 * Distinct context keys per case avoid the in-isolate cache (getOrSetCached
 * L1 Map) returning a prior case's value.
 *
 * Run: node --import tsx --test src/services/help/__tests__/help-mapping-service.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HelpMappingService } from "../help-mapping-service.js";

type DbLike = ConstructorParameters<typeof HelpMappingService>[0];

function fakeDb(results: unknown[]): DbLike {
  let i = 0;
  const proxy: unknown = new Proxy(function () {} as object, {
    get(_t, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => void) => resolve(results[i++]);
      }
      return () => proxy;
    },
    apply() {
      return proxy;
    },
  });
  return proxy as DbLike;
}

describe("HelpMappingService.resolveForContext()", () => {
  it("returns the ordered slug list for a context", async () => {
    const svc = new HelpMappingService(
      fakeDb([[{ slug: "good-video-resume" }, { slug: "edit-video-resume" }]]),
    );
    assert.deepEqual(await svc.resolveForContext("resume-edit"), [
      "good-video-resume",
      "edit-video-resume",
    ]);
  });

  it("returns an empty list for a context with no mappings", async () => {
    const svc = new HelpMappingService(fakeDb([[]]));
    assert.deepEqual(await svc.resolveForContext("interview-practice"), []);
  });
});

describe("HelpMappingService.listActiveContextKeys()", () => {
  it("returns just the distinct context keys", async () => {
    const svc = new HelpMappingService(
      fakeDb([[{ contextKey: "studio" }, { contextKey: "job-list" }]]),
    );
    assert.deepEqual(await svc.listActiveContextKeys(), ["studio", "job-list"]);
  });
});

describe("HelpMappingService.searchSemantic()", () => {
  it("returns no results + semantic:false for a too-short query (no Vectorize call)", async () => {
    const svc = new HelpMappingService(fakeDb([]));
    assert.deepEqual(await svc.searchSemantic("a"), { slugs: [], semantic: false });
  });

  it("reports semantic:false when Vectorize is unbound (local-dev fallback)", async () => {
    const svc = new HelpMappingService(fakeDb([]));
    // No VECTORIZE/AI bindings in the test env → semanticSearchHelpIds → null.
    assert.deepEqual(await svc.searchSemantic("video resume"), { slugs: [], semantic: false });
  });
});

describe("HelpMappingService.reindex() pruning (#2076)", () => {
  it("upserts current items and deletes vectors for slugs no longer present", async () => {
    const deleted: string[] = [];
    const upserted: string[] = [];
    let recorded: string[] | null = null;
    const prevEnv = (globalThis as any).__ENV;
    (globalThis as any).__ENV = {
      KV_CACHE: {
        get: async () => ["old-removed", "keep-me"], // ledger from last reindex
        put: async (_k: string, v: string) => {
          recorded = JSON.parse(v);
        },
      },
      AI: { run: async () => ({ data: [[0.1, 0.2, 0.3]] }) },
      VECTORIZE: {
        upsert: async (vs: Array<{ id: string }>) => upserted.push(...vs.map((v) => v.id)),
        deleteByIds: async (ids: string[]) => deleted.push(...ids),
        query: async () => ({ matches: [] }),
      },
    };
    try {
      const svc = new HelpMappingService(fakeDb([]));
      const count = await svc.reindex([
        { slug: "keep-me", text: "kept content" },
        { slug: "new-one", text: "new content" },
      ]);
      assert.equal(count, 2);
      assert.deepEqual(upserted.sort(), ["keep-me", "new-one"]);
      // "old-removed" was in the ledger but not in the new set → pruned.
      assert.deepEqual(deleted, ["old-removed"]);
      // The new ledger records exactly the current slugs.
      assert.deepEqual(recorded!.sort(), ["keep-me", "new-one"]);
    } finally {
      (globalThis as any).__ENV = prevEnv;
    }
  });
});

describe("HelpMappingService.remove()", () => {
  it("returns true when a row was deleted, false when none matched", async () => {
    const ok = new HelpMappingService(fakeDb([[{ contextKey: "dashboard" }]]));
    assert.equal(await ok.remove("id-1"), true);
    const none = new HelpMappingService(fakeDb([[]]));
    assert.equal(await none.remove("missing"), false);
  });
});
