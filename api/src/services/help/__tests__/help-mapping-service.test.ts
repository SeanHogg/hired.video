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

describe("HelpMappingService.remove()", () => {
  it("returns true when a row was deleted, false when none matched", async () => {
    const ok = new HelpMappingService(fakeDb([[{ contextKey: "dashboard" }]]));
    assert.equal(await ok.remove("id-1"), true);
    const none = new HelpMappingService(fakeDb([[]]));
    assert.equal(await none.remove("missing"), false);
  });
});
