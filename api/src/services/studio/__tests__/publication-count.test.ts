/**
 * Published-channel count on the studio project LIST (YourKits "Posted to N").
 * Rows mirror real `studio_project_publications` destinations ("profile",
 * "youtube", "linkedin") grouped per project by the one bulk query.
 *
 * Run: node --import tsx --test src/services/studio/__tests__/publication-count.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  countPublishedChannelsByProject,
  publishedChannelCounts,
} from "../publication-service.js";

type Db = NonNullable<Parameters<typeof countPublishedChannelsByProject>[1]>;

/** Minimal drizzle select-chain stub: records how many queries ran and
 *  resolves the grouped rows at `.groupBy()`. */
function stubDb(rows: Array<{ projectId: string; channels: number | string | null }>) {
  const calls = { select: 0, groupBy: 0 };
  const chain = {
    from: () => chain,
    where: () => chain,
    groupBy: async () => {
      calls.groupBy += 1;
      return rows;
    },
  };
  const db = {
    select: () => {
      calls.select += 1;
      return chain;
    },
  } as unknown as Db;
  return { db, calls };
}

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const P3 = "33333333-3333-4333-8333-333333333333";

describe("publishedChannelCounts", () => {
  it("maps grouped rows to per-project counts", () => {
    const counts = publishedChannelCounts([
      { projectId: P1, channels: 3 },
      { projectId: P2, channels: 1 },
    ]);
    assert.equal(counts.get(P1), 3);
    assert.equal(counts.get(P2), 1);
  });

  it("drops projects whose records are all failed/pending (count 0)", () => {
    const counts = publishedChannelCounts([{ projectId: P1, channels: 0 }]);
    assert.equal(counts.has(P1), false);
  });

  it("coerces a bigint-as-string count from the driver", () => {
    assert.equal(publishedChannelCounts([{ projectId: P1, channels: "2" }]).get(P1), 2);
  });

  it("treats null / non-numeric counts as 0", () => {
    const counts = publishedChannelCounts([
      { projectId: P1, channels: null },
      { projectId: P2, channels: "n/a" },
    ]);
    assert.equal(counts.size, 0);
  });
});

describe("countPublishedChannelsByProject", () => {
  it("runs ONE grouped query for the whole list (no per-row reads)", async () => {
    const { db, calls } = stubDb([
      { projectId: P1, channels: 2 },
      { projectId: P2, channels: 1 },
    ]);
    const counts = await countPublishedChannelsByProject([P1, P2, P3], db);
    assert.equal(calls.select, 1);
    assert.equal(calls.groupBy, 1);
    assert.equal(counts.get(P1), 2);
    assert.equal(counts.get(P2), 1);
    // Never published → absent (the route reads it as 0).
    assert.equal(counts.get(P3), undefined);
  });

  it("skips the query entirely for an empty list", async () => {
    const { db, calls } = stubDb([]);
    const counts = await countPublishedChannelsByProject([], db);
    assert.equal(calls.select, 0);
    assert.equal(counts.size, 0);
  });
});
