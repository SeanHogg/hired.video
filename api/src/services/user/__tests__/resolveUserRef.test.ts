/**
 * Tests for resolveUserRef — the "UUID-or-customUrlSlug → userId" seam shared
 * by every public read route (articles, courses, users). Covers the happy
 * path (slug resolves), the boundary (UUID short-circuits without a query),
 * and the exception (unknown slug → null) so a custom-slug link can never
 * silently resolve to the wrong author again (regression guard for #1671).
 *
 * Run: node --import tsx --test src/services/user/__tests__/resolveUserRef.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveUserRef } from "../resolveUserRef.js";

const UUID = "22222222-2222-2222-2222-222222222222";

/** Minimal chainable Drizzle stub. `limit()` resolves to `rows`; `selects`
 *  counts how many times the query was actually issued so we can prove the
 *  UUID path never touches the DB. */
function makeFakeDb(rows: unknown[]): { db: any; calls: { selects: number } } {
  const calls = { selects: 0 };
  const chain: any = {
    from: () => chain,
    where: () => chain,
    limit: async () => rows,
  };
  const db: any = {
    select: () => {
      calls.selects += 1;
      return chain;
    },
  };
  return { db, calls };
}

describe("resolveUserRef", () => {
  it("short-circuits a UUID ref without querying the DB", async () => {
    const { db, calls } = makeFakeDb([]);
    const result = await resolveUserRef(db, UUID);
    assert.equal(result, UUID);
    assert.equal(calls.selects, 0, "a UUID ref must not hit userProfiles");
  });

  it("resolves a customUrlSlug to its userId", async () => {
    const { db, calls } = makeFakeDb([{ userId: UUID }]);
    const result = await resolveUserRef(db, "jane-doe");
    assert.equal(result, UUID);
    assert.equal(calls.selects, 1);
  });

  it("returns null when a slug matches no profile", async () => {
    const { db } = makeFakeDb([]);
    const result = await resolveUserRef(db, "nobody-here");
    assert.equal(result, null);
  });
});
