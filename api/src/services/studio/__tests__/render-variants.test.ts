/**
 * Fitted cuts (#2045) — storeRenderVariant / getRenderVariant over the
 * render-variant repository: dedupe (an existing cut is reused, a racing
 * writer drops its own copy), reclaiming superseded revisions, the cached
 * read and its invalidation on write, and key/revision validation.
 *
 * The db stub answers each awaited statement from a queue, in statement
 * order, and logs which statements ran (select / insert / delete).
 *
 * Run: node --import tsx --test src/services/studio/__tests__/render-variants.test.ts
 */
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getRenderVariant,
  RenderVariantError,
  storeRenderVariant,
  type RenderVariantDeps,
} from "../render-variants.js";
import { __resetEdgeCacheForTests } from "../../../utils/edge-cache.js";
import { __resetIsolateCacheForTests } from "../../../utils/isolate-cache.js";

const OWNER = "8f2c1a9e-4b7d-4e21-9c3a-1d5e6f7a8b9c";
const PROJECT = "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d";
const NEW_VIDEO = "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f";
const OLD_VIDEO = "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b";
const VARIANT = "6f7a8b9c-0d1e-4f2a-9b3c-4d5e6f7a8b9c";
// Shaped like the client's revision: baked-freshness djb2 hash + branding.
const REVISION = "v2-1k9x3f-4c.b";

const project = { id: PROJECT, userId: OWNER, companyId: null };
const existingCut = {
  id: VARIANT,
  projectId: PROJECT,
  variantKey: "9x16-full",
  contentRevision: REVISION,
  videoId: OLD_VIDEO,
  r2Key: `studio/${OWNER}/${PROJECT}/variants/9x16-full-1759000000000.mp4`,
  branded: true,
};

function dbReturning(...rowSets: unknown[][]) {
  const queue = [...rowSets];
  const log: string[] = [];
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "where", "limit", "values", "onConflictDoNothing", "returning"]) {
    chain[m] = () => chain;
  }
  for (const m of ["select", "insert", "delete"]) chain[m] = () => (log.push(m), chain);
  chain.then = (resolve: (v: unknown) => void) => resolve(queue.shift() ?? []);
  return { db: chain as unknown as NonNullable<RenderVariantDeps["db"]>, log, remaining: () => queue.length };
}

function storage() {
  const puts: string[] = [];
  const deleted: Array<string | null | undefined> = [];
  return {
    puts,
    deleted,
    deps: {
      put: (async (key: string) => (puts.push(key), true)) as unknown as RenderVariantDeps["put"],
      deleteKeys: (async (keys: ReadonlyArray<string | null | undefined>) => (deleted.push(...keys), keys.length)) as unknown as RenderVariantDeps["deleteKeys"],
    },
  };
}

const upload = {
  actorUserId: OWNER,
  projectId: PROJECT,
  variantKey: "9x16-full",
  contentRevision: REVISION,
  bytes: new ArrayBuffer(16),
  contentType: "video/mp4",
  branded: true,
  title: "Dana Reyes — product designer",
};

describe("storeRenderVariant", () => {
  beforeEach(() => {
    __resetEdgeCacheForTests();
    __resetIsolateCacheForTests();
  });

  it("stores a new cut as a private video + variant row, then reclaims the superseded revision", async () => {
    const { db, log, remaining } = dbReturning(
      [project], // project lookup
      [], // no cut for this revision yet
      [{ id: NEW_VIDEO }], // videos insert
      [{ id: VARIANT }], // variant insert
      [{ videoId: OLD_VIDEO, r2Key: "studio/old/9x16-full.mp4", contentRevision: "v2-0aa1-4b.b" }], // superseded
      [], // delete the old video row (cascades its variant row)
    );
    const store = storage();
    const dto = await storeRenderVariant(upload, { db, ...store.deps });
    assert.equal(dto.variantId, VARIANT);
    assert.equal(dto.videoId, NEW_VIDEO);
    assert.equal(dto.variantKey, "9x16-full");
    assert.equal(store.puts.length, 1);
    assert.match(store.puts[0], new RegExp(`^studio/${OWNER}/${PROJECT}/variants/9x16-full-\\d+\\.mp4$`));
    assert.match(dto.videoUrl ?? "", /variants\/9x16-full-\d+\.mp4$/);
    assert.deepEqual(store.deleted, ["studio/old/9x16-full.mp4"]);
    assert.deepEqual(log, ["select", "select", "insert", "insert", "select", "delete"]);
    assert.equal(remaining(), 0);
  });

  it("reuses an existing cut for the same project, key and revision — nothing is stored (dedupe)", async () => {
    const { db, log } = dbReturning([project], [existingCut]);
    const store = storage();
    const dto = await storeRenderVariant(upload, { db, ...store.deps });
    assert.equal(dto.variantId, VARIANT);
    assert.equal(dto.videoId, OLD_VIDEO);
    assert.equal(store.puts.length, 0);
    assert.deepEqual(log, ["select", "select"]);
  });

  it("drops its own copy when a racing writer stored the same cut first (boundary)", async () => {
    const { db, log } = dbReturning(
      [project],
      [], // not there when we looked
      [{ id: NEW_VIDEO }],
      [], // unique index: our insert did nothing
      [], // delete our video row
      [existingCut], // the winner
    );
    const store = storage();
    const dto = await storeRenderVariant(upload, { db, ...store.deps });
    assert.equal(dto.videoId, OLD_VIDEO);
    assert.equal(store.puts.length, 1);
    assert.deepEqual(store.deleted, [store.puts[0]]);
    assert.deepEqual(log, ["select", "select", "insert", "insert", "delete", "select"]);
  });

  it("rejects a malformed key or revision before touching the DB or storage (error case)", async () => {
    for (const bad of [{ variantKey: "9:16-full" }, { variantKey: "master" }, { contentRevision: "" }, { contentRevision: "a b" }]) {
      const { db, log } = dbReturning([project]);
      const store = storage();
      await assert.rejects(
        storeRenderVariant({ ...upload, ...bad }, { db, ...store.deps }),
        (e: unknown) => e instanceof RenderVariantError && e.kind === "INVALID_VARIANT",
      );
      assert.deepEqual(log, []);
      assert.equal(store.puts.length, 0);
    }
  });

  it("404s a missing project and stores nothing", async () => {
    const { db } = dbReturning([]);
    const store = storage();
    await assert.rejects(
      storeRenderVariant(upload, { db, ...store.deps }),
      (e: unknown) => e instanceof RenderVariantError && e.kind === "PROJECT_NOT_FOUND",
    );
    assert.equal(store.puts.length, 0);
  });

  it("refuses an actor who can't post the project", async () => {
    const { db } = dbReturning([project]);
    const store = storage();
    const forbidden = new Error("forbidden");
    await assert.rejects(
      storeRenderVariant(upload, {
        db,
        ...store.deps,
        assertWrite: async () => {
          throw forbidden;
        },
      }),
      (e: unknown) => e === forbidden,
    );
    assert.equal(store.puts.length, 0);
  });
});

describe("getRenderVariant", () => {
  beforeEach(() => {
    __resetEdgeCacheForTests();
    __resetIsolateCacheForTests();
  });
  const ask = { actorUserId: OWNER, projectId: PROJECT, variantKey: "9x16-full", contentRevision: REVISION };

  it("never caches a miss — another isolate may store the cut", async () => {
    const first = dbReturning([project], []);
    assert.equal(await getRenderVariant(ask, { db: first.db }), null);
    const second = dbReturning([project], []);
    assert.equal(await getRenderVariant(ask, { db: second.db }), null);
    assert.deepEqual(second.log, ["select", "select"], "the variant lookup re-ran");
  });

  it("serves a repeat hit from the cache, and a write invalidates it", async () => {
    const write = dbReturning([project], [], [{ id: NEW_VIDEO }], [{ id: VARIANT }], []);
    await storeRenderVariant(upload, { db: write.db, ...storage().deps });
    const first = dbReturning([project], [{ ...existingCut, videoId: NEW_VIDEO }]);
    assert.equal((await getRenderVariant(ask, { db: first.db }))?.videoId, NEW_VIDEO);
    const second = dbReturning([project]);
    assert.equal((await getRenderVariant(ask, { db: second.db }))?.videoId, NEW_VIDEO);
    assert.deepEqual(second.log, ["select"], "only the ownership check ran");
  });

  it("rejects a malformed revision (error case)", async () => {
    const { db } = dbReturning([project]);
    await assert.rejects(
      getRenderVariant({ ...ask, contentRevision: "../../etc" }, { db }),
      (e: unknown) => e instanceof RenderVariantError && e.kind === "INVALID_VARIANT",
    );
  });
});
