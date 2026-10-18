/**
 * Pure-logic tests for the take-home magic-link invite primitives
 * (services/hiring/take-home-invites.ts). The route's token mint + expiry math
 * was previously inlined and untested; it's now extracted into three
 * pure helpers the route delegates to, so this suite pins the
 * round-trip + the expiry boundary the public `/by-token/:token` read
 * gates on.
 *
 * The DB writes themselves (insert/update via getDb) are Drizzle's
 * concern and exercised by the route integration surface; here we lock
 * the value semantics that decide whether a candidate's link still works.
 *
 * Run: node --import tsx --test src/routes/__tests__/take-home-invites-token.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  generateInviteToken,
  computeExpiresAt,
  isInviteExpired,
} from "../../services/hiring/take-home-invites.js";

const DAY_MS = 86_400_000;

describe("generateInviteToken", () => {
  it("is prefixed `th-` and hex-only after the prefix (round-trips as a token)", () => {
    const t = generateInviteToken();
    assert.match(t, /^th-[0-9a-z]+$/);
  });

  it("fits the 64-char invite_token column", () => {
    for (let i = 0; i < 100; i++) {
      assert.ok(generateInviteToken().length <= 64);
    }
  });

  it("mints distinct tokens (no collisions across a batch)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(generateInviteToken());
    assert.equal(seen.size, 1000);
  });
});

describe("computeExpiresAt", () => {
  it("adds exactly N days to the issue instant", () => {
    const now = Date.parse("2026-06-07T00:00:00.000Z");
    const exp = computeExpiresAt(14, now);
    assert.equal(exp.getTime(), now + 14 * DAY_MS);
  });

  it("the minimum 1-day window lands 24h out", () => {
    const now = Date.parse("2026-06-07T12:00:00.000Z");
    assert.equal(computeExpiresAt(1, now).getTime(), now + DAY_MS);
  });

  it("the maximum 60-day window lands 60d out", () => {
    const now = 0;
    assert.equal(computeExpiresAt(60, now).getTime(), 60 * DAY_MS);
  });
});

describe("isInviteExpired (boundary)", () => {
  const expiresAt = new Date("2026-06-07T00:00:00.000Z");

  it("is NOT expired one ms before the expiry instant", () => {
    assert.equal(isInviteExpired(expiresAt, expiresAt.getTime() - 1), false);
  });

  it("is NOT expired exactly AT the expiry instant (strict `<`)", () => {
    assert.equal(isInviteExpired(expiresAt, expiresAt.getTime()), false);
  });

  it("IS expired one ms after the expiry instant", () => {
    assert.equal(isInviteExpired(expiresAt, expiresAt.getTime() + 1), true);
  });

  it("round-trips: a freshly minted 14-day invite is not yet expired", () => {
    const now = Date.now();
    const exp = computeExpiresAt(14, now);
    assert.equal(isInviteExpired(exp, now), false);
    // …but is expired once we step past the window.
    assert.equal(isInviteExpired(exp, now + 14 * DAY_MS + 1), true);
  });
});
