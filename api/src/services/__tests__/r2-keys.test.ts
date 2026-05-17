/**
 * R2 key registry — pure-function coverage for the parts that decide whether
 * an R2 object is an orphan. Misclassification here is dangerous: a false
 * positive lets the admin bulk-delete legitimate user content, so every
 * known prefix is asserted explicitly.
 *
 * Run: node --import tsx --test src/services/__tests__/r2-keys.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  deriveOwner,
  summarizeByUser,
  classifyOrphans,
} from "../storage/r2-keys.js";

const UID_A = "11111111-1111-1111-1111-111111111111";
const UID_B = "22222222-2222-2222-2222-222222222222";
const UID_GONE = "99999999-9999-9999-9999-999999999999";

describe("deriveOwner", () => {
  it("recognises studio project video keys", () => {
    const d = deriveOwner(`studio/${UID_A}/proj/123-video.webm`);
    assert.equal(d.pattern?.label, "studio project video");
    assert.equal(d.userId, UID_A);
  });

  it("recognises studio recordings before falling through to studio project", () => {
    const d = deriveOwner(`studio/recordings/${UID_A}/123-cam.webm`);
    assert.equal(d.pattern?.label, "studio recordings");
    assert.equal(d.userId, UID_A);
  });

  it("recognises voice clone sample keys", () => {
    const d = deriveOwner(`studio/voice-clones/${UID_A}/abc.webm`);
    assert.equal(d.pattern?.label, "studio voice clones");
  });

  it("recognises uploads/{userId}/...", () => {
    const d = deriveOwner(`uploads/${UID_A}/files/foo.wav`);
    assert.equal(d.pattern?.label, "user uploads");
    assert.equal(d.userId, UID_A);
  });

  it("recognises NLE source + proxy keys", () => {
    assert.equal(deriveOwner(`nle-sources/${UID_A}/hash`).pattern?.label, "NLE source");
    assert.equal(deriveOwner(`nle-proxies/${UID_A}/proj-hash.mp4`).pattern?.label, "NLE proxy");
  });

  it("recognises stock/ as a shared (non-user-owned) prefix", () => {
    const d = deriveOwner("stock/abcdef.jpg");
    assert.equal(d.pattern?.label, "stock media");
    assert.equal(d.pattern?.ownerKind, "shared");
    assert.equal(d.userId, null);
  });

  it("returns null pattern for unknown prefixes", () => {
    assert.equal(deriveOwner("legacy/random.png").pattern, null);
    assert.equal(deriveOwner("").pattern, null);
  });

  it("returns null userId when the {userId} segment isn't a UUID", () => {
    const d = deriveOwner("studio/not-a-uuid/proj/v.webm");
    assert.equal(d.pattern, null);
  });
});

describe("summarizeByUser", () => {
  it("rolls up keys across every known prefix, descending by bytes", () => {
    const result = summarizeByUser([
      { key: `studio/${UID_A}/p/v1.webm`,             size: 100 },
      { key: `studio/recordings/${UID_A}/cam.webm`,   size: 50 },
      { key: `uploads/${UID_B}/files/foo.wav`,        size: 500 },
      { key: "stock/abc.jpg",                          size: 25 },
      { key: "legacy/orphan.bin",                      size: 10 },
    ]);
    assert.deepEqual(result, [
      { userId: UID_B, bytes: 500, objectCount: 1 },
      { userId: UID_A, bytes: 150, objectCount: 2 },
      { userId: "shared", bytes: 25, objectCount: 1 },
      { userId: "other",  bytes: 10, objectCount: 1 },
    ]);
  });

  it("returns an empty array when no objects are present", () => {
    assert.deepEqual(summarizeByUser([]), []);
  });
});

describe("classifyOrphans", () => {
  const liveUsers = new Set([UID_A, UID_B]);

  it("keeps user-owned objects whose owner exists", () => {
    const objs = [
      { key: `studio/${UID_A}/p/v.webm`, size: 1, uploaded: "" },
      { key: `uploads/${UID_B}/files/x.wav`, size: 1, uploaded: "" },
    ];
    const { orphans } = classifyOrphans(objs, new Set(), liveUsers);
    assert.deepEqual(orphans, []);
  });

  it("flags user-owned objects whose owner is gone", () => {
    const objs = [
      { key: `studio/${UID_GONE}/p/v.webm`, size: 1, uploaded: "" },
    ];
    const { orphans, reasons } = classifyOrphans(objs, new Set(), liveUsers);
    assert.equal(orphans.length, 1);
    assert.match(reasons.get(objs[0].key)!, /owner.*no longer exists/);
  });

  it("flags stock/ objects only when no DB row references them", () => {
    const tracked = { key: "stock/aaa.jpg", size: 1, uploaded: "" };
    const untracked = { key: "stock/bbb.jpg", size: 1, uploaded: "" };
    const linked = new Set(["stock/aaa.jpg"]);
    const { orphans } = classifyOrphans([tracked, untracked], linked, liveUsers);
    assert.deepEqual(orphans, [untracked]);
  });

  it("keeps DB-tracked keys regardless of whether their path owner exists", () => {
    // Legacy keys with no userId segment, but persisted in e.g. videos.r2Key.
    const objs = [{ key: "legacy/old-render.mp4", size: 1, uploaded: "" }];
    const linked = new Set(["legacy/old-render.mp4"]);
    const { orphans } = classifyOrphans(objs, linked, liveUsers);
    assert.deepEqual(orphans, []);
  });

  it("flags objects whose key matches no known prefix and isn't DB-tracked", () => {
    const objs = [{ key: "random-junk", size: 1, uploaded: "" }];
    const { orphans, reasons } = classifyOrphans(objs, new Set(), liveUsers);
    assert.equal(orphans.length, 1);
    assert.equal(reasons.get("random-junk"), "unrecognised key prefix");
  });
});
