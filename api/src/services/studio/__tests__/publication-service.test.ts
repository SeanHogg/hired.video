/**
 * R12 — publication readers take renderVariantId.
 *   omit  → destination-wide (no variant filter; latest by publishedAt)
 *   null  → master only
 *   id    → that cut
 *
 * Run: node --import tsx --test src/services/studio/__tests__/publication-service.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getPublication,
  publicationVariantMatch,
  removePublication,
} from "../publication-service.js";

type Db = NonNullable<Parameters<typeof getPublication>[3]>;

const PROJECT = "11111111-1111-4111-8111-111111111111";
const CUT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function selectStub(opts: { row?: Record<string, unknown> | null } = {}) {
  const calls = { orderBy: 0, limit: 0, where: 0 };
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.where = () => {
    calls.where += 1;
    return chain;
  };
  chain.orderBy = () => {
    calls.orderBy += 1;
    return chain;
  };
  chain.limit = async () => {
    calls.limit += 1;
    return opts.row ? [opts.row] : [];
  };
  const db = { select: () => chain } as unknown as Db;
  return { db, calls };
}

function deleteStub() {
  const calls = { delete: 0, where: 0 };
  const db = {
    delete: () => {
      calls.delete += 1;
      return {
        where: async () => {
          calls.where += 1;
        },
      };
    },
  } as unknown as Db;
  return { db, calls };
}

const liveRow = {
  id: "pub-1",
  destination: "youtube",
  externalId: "yt-1",
  externalUrl: "https://youtu.be/1",
  status: "published",
  publishedAt: new Date("2026-10-11T14:00:00.000Z"),
  updatedAt: new Date("2026-10-11T14:00:00.000Z"),
  renderVariantId: CUT,
};

describe("publicationVariantMatch", () => {
  it("omitted variant is destination-wide (no SQL filter)", () => {
    assert.equal(publicationVariantMatch(undefined), undefined);
  });

  it("null is master-only (isNull)", () => {
    const cond = publicationVariantMatch(null);
    assert.ok(cond, "master filter must be present");
  });

  it("an id is that cut", () => {
    const cond = publicationVariantMatch(CUT);
    assert.ok(cond, "cut filter must be present");
  });
});

describe("getPublication", () => {
  it("omitted variant orders by publishedAt desc (latest live cut)", async () => {
    const { db, calls } = selectStub({ row: liveRow });
    const rec = await getPublication(PROJECT, "youtube", undefined, db);
    assert.equal(calls.orderBy, 1);
    assert.equal(calls.limit, 1);
    assert.equal(rec?.renderVariantId, CUT);
    assert.equal(rec?.publishedAt, "2026-10-11T14:00:00.000Z");
  });

  it("explicit null (master) does not order — it filters to the master row", async () => {
    const { db, calls } = selectStub({
      row: { ...liveRow, renderVariantId: null },
    });
    const rec = await getPublication(PROJECT, "youtube", null, db);
    assert.equal(calls.orderBy, 0);
    assert.equal(calls.limit, 1);
    assert.equal(rec?.renderVariantId, null);
  });

  it("explicit cut id does not order — it filters to that cut", async () => {
    const { db, calls } = selectStub({ row: liveRow });
    const rec = await getPublication(PROJECT, "youtube", CUT, db);
    assert.equal(calls.orderBy, 0);
    assert.equal(rec?.renderVariantId, CUT);
  });

  it("returns null when no row matches", async () => {
    const { db } = selectStub({});
    assert.equal(await getPublication(PROJECT, "youtube", CUT, db), null);
  });
});

describe("removePublication", () => {
  it("omitted variant still deletes (destination-wide)", async () => {
    const { db, calls } = deleteStub();
    await removePublication(PROJECT, "profile", undefined, db);
    assert.equal(calls.delete, 1);
    assert.equal(calls.where, 1);
  });

  it("explicit null deletes only the master row", async () => {
    const { db, calls } = deleteStub();
    await removePublication(PROJECT, "profile", null, db);
    assert.equal(calls.delete, 1);
    assert.equal(calls.where, 1);
  });

  it("explicit cut id deletes only that cut", async () => {
    const { db, calls } = deleteStub();
    await removePublication(PROJECT, "youtube", CUT, db);
    assert.equal(calls.delete, 1);
    assert.equal(calls.where, 1);
  });
});
