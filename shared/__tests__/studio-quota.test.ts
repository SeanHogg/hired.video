/**
 * Studio quota policy tests.
 *
 * The same gate is consulted by /api/studio/upload (server-side enforcement)
 * and by handleExport in the studio UI (client pre-check). Drift between
 * the two means a SuperAdmin pre-check could pass while the server still
 * rejects, or a free user could waste a 30s render on a request the
 * server is going to 402. These tests pin the contract.
 *
 * Run: node --import tsx --test shared/__tests__/studio-quota.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decideStudioQuota, FREE_VIDEO_QUOTA } from "../studio-quota.js";

describe("decideStudioQuota", () => {
  it("allows SuperAdmin even with many published videos", () => {
    const decision = decideStudioQuota({
      isPro: false,
      isSuperAdmin: true,
      publishedVideoCount: 50,
    });
    assert.equal(decision.allowed, true);
    assert.equal(decision.reason, "super-admin");
  });

  it("allows Pro users without bound", () => {
    const decision = decideStudioQuota({
      isPro: true,
      isSuperAdmin: false,
      publishedVideoCount: 99,
    });
    assert.equal(decision.allowed, true);
    assert.equal(decision.reason, "pro");
  });

  it("allows free users below the quota", () => {
    const decision = decideStudioQuota({
      isPro: false,
      isSuperAdmin: false,
      publishedVideoCount: 0,
    });
    assert.equal(decision.allowed, true);
    assert.equal(decision.reason, "ok");
  });

  it("blocks free users at exactly the quota threshold", () => {
    const decision = decideStudioQuota({
      isPro: false,
      isSuperAdmin: false,
      publishedVideoCount: FREE_VIDEO_QUOTA,
    });
    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, "free-quota-exceeded");
  });

  it("blocks free users above the quota", () => {
    const decision = decideStudioQuota({
      isPro: false,
      isSuperAdmin: false,
      publishedVideoCount: 5,
    });
    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, "free-quota-exceeded");
  });

  it("SuperAdmin always wins over Pro check (cheaper code path) and over quota", () => {
    // A SuperAdmin who happens to also be Pro = SuperAdmin reason wins.
    const decision = decideStudioQuota({
      isPro: true,
      isSuperAdmin: true,
      publishedVideoCount: 0,
    });
    assert.equal(decision.reason, "super-admin");
  });
});
