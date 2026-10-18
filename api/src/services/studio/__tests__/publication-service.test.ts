/**
 * R12 — publication readers take renderVariantId.
 *   omit  → destination-wide (no variant filter)
 *   null  → master only
 *   id    → that cut
 *
 * Run: node --import tsx --test src/services/studio/__tests__/publication-service.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  publicationVariantMatch,
  removePublication,
} from "../publication-service.js";

type Db = NonNullable<Parameters<typeof removePublication>[3]>;

const PROJECT = "11111111-1111-4111-8111-111111111111";
const CUT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

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
