/**
 * HelpMappingService tests.
 *
 * Same chainable-Drizzle-stub approach as page-embed-service.test.ts: the
 * service takes its `db` by constructor injection, so we drive it with a
 * stub whose every builder method returns the same thenable and awaiting
 * resolves the next queued result set. We pin the PROJECTION + return
 * shapes (rows → HelpArticleCard, null summary → "", delete → boolean);
 * the SQL is Drizzle's concern.
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
  it("projects joined rows into HelpArticleCard, coercing a null summary to ''", async () => {
    const svc = new HelpMappingService(
      fakeDb([
        [
          {
            id: "a1",
            slug: "good-video-resume",
            title: "What makes a good video resume?",
            summary: null,
            kind: "faq",
            userId: "editorial",
            readMinutes: 1,
          },
        ],
      ]),
    );
    const res = await svc.resolveForContext("resume-edit");
    assert.equal(res.context, "resume-edit");
    assert.equal(res.articles.length, 1);
    assert.deepEqual(res.articles[0], {
      id: "a1",
      slug: "good-video-resume",
      title: "What makes a good video resume?",
      summary: "",
      kind: "faq",
      userId: "editorial",
      readMinutes: 1,
    });
  });

  it("returns an empty article set for a context with no mappings", async () => {
    const svc = new HelpMappingService(fakeDb([[]]));
    const res = await svc.resolveForContext("interview-practice");
    assert.equal(res.context, "interview-practice");
    assert.deepEqual(res.articles, []);
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

describe("HelpMappingService.remove()", () => {
  it("returns true when a row was deleted, false when none matched", async () => {
    const ok = new HelpMappingService(fakeDb([[{ contextKey: "dashboard" }]]));
    assert.equal(await ok.remove("id-1"), true);
    const none = new HelpMappingService(fakeDb([[]]));
    assert.equal(await none.remove("missing"), false);
  });
});
