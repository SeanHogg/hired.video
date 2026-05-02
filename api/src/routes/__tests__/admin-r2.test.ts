/**
 * Admin R2 helpers — pure functions tested in isolation.
 *
 * The route handlers themselves are mostly composition over the R2 binding
 * + Drizzle, which is covered by integration tests. The two pieces of
 * actual logic worth pinning are:
 *   • userIdFromKey   — must follow the `studio/{userId}/...` convention,
 *                       and route everything else to the synthetic `"other"`
 *                       bucket so legacy keys aren't silently dropped.
 *   • summarizeByUser — sums bytes + object counts per owner, descending
 *                       by bytes so the admin sees the heaviest user first.
 *   • findOrphans     — keys that exist in R2 but not in the `videos` set.
 *
 * Run: node --import tsx --test src/routes/__tests__/admin-r2.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  userIdFromKey,
  summarizeByUser,
  findOrphans,
} from "../admin-r2.js";

describe("userIdFromKey", () => {
  it("extracts the user id from a studio/{userId}/... key", () => {
    assert.equal(
      userIdFromKey("studio/abc123-uuid/proj1/1717012345-video.webm"),
      "abc123-uuid",
    );
  });

  it("returns 'other' for keys outside the studio convention", () => {
    assert.equal(userIdFromKey("uploads/random.png"), "other");
    assert.equal(userIdFromKey("legacy-thumbnail.jpg"), "other");
  });

  it("returns 'other' for malformed keys missing the user segment", () => {
    assert.equal(userIdFromKey("studio/"), "other");
    assert.equal(userIdFromKey("studio"), "other");
    assert.equal(userIdFromKey(""), "other");
  });
});

describe("summarizeByUser", () => {
  it("rolls up multiple objects per user with descending byte order", () => {
    const result = summarizeByUser([
      { key: "studio/user-a/p1/v1.webm", size: 100 },
      { key: "studio/user-a/p1/v2.webm", size: 50  },
      { key: "studio/user-b/p1/v1.webm", size: 500 },
      { key: "uploads/foo.png",          size: 25  },
    ]);
    assert.deepEqual(result, [
      { userId: "user-b", bytes: 500, objectCount: 1 },
      { userId: "user-a", bytes: 150, objectCount: 2 },
      { userId: "other",  bytes: 25,  objectCount: 1 },
    ]);
  });

  it("returns an empty array when no objects are present", () => {
    assert.deepEqual(summarizeByUser([]), []);
  });

  it("sorts by bytes — not by object count — when they disagree", () => {
    // user-x has many tiny objects; user-y has one huge one. Bytes wins.
    const result = summarizeByUser([
      { key: "studio/user-x/p/a", size: 10 },
      { key: "studio/user-x/p/b", size: 10 },
      { key: "studio/user-x/p/c", size: 10 },
      { key: "studio/user-y/p/big", size: 1_000_000 },
    ]);
    assert.equal(result[0].userId, "user-y");
    assert.equal(result[1].userId, "user-x");
  });
});

describe("findOrphans", () => {
  it("returns only objects whose key isn't in the linked set", () => {
    const objects = [
      { key: "studio/u/p/a.webm", size: 1 },
      { key: "studio/u/p/b.webm", size: 2 },
      { key: "studio/u/p/c.webm", size: 3 },
    ];
    const linked = new Set(["studio/u/p/a.webm", "studio/u/p/c.webm"]);
    assert.deepEqual(findOrphans(objects, linked), [
      { key: "studio/u/p/b.webm", size: 2 },
    ]);
  });

  it("returns the original list when nothing is linked", () => {
    const objects = [{ key: "studio/u/p/a", size: 1 }];
    assert.deepEqual(findOrphans(objects, new Set()), objects);
  });

  it("returns an empty list when every object is linked", () => {
    const objects = [{ key: "studio/u/p/a", size: 1 }];
    assert.deepEqual(findOrphans(objects, new Set(["studio/u/p/a"])), []);
  });
});
