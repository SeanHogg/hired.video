/**
 * Tests for the one-tap 2FA approve-token signer (gap #2225).
 *
 * Verifies:
 *   • Round-trip: a token minted for a challenge id verifies + recovers
 *     that exact id.
 *   • Tamper rejection: flipping the signature or the id fails.
 *   • A foreign / unsigned token fails.
 *   • No-secret env mints null and verifies nothing (fail-closed).
 *
 * Run: node --import tsx --test src/services/__tests__/two-factor-approve.test.ts
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

import {
  mintTwoFactorApproveToken,
  verifyTwoFactorApproveToken,
} from "../auth/twoFactorApprove.js";

const CHALLENGE_ID = "11111111-2222-4333-8444-555555555555";

describe("twoFactorApprove signer", () => {
  let prevSecret: string | undefined;
  before(() => {
    prevSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "test-secret-for-2fa-approve";
  });
  after(() => {
    if (prevSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prevSecret;
  });

  it("round-trips: mint then verify recovers the challenge id", async () => {
    const token = await mintTwoFactorApproveToken(CHALLENGE_ID);
    assert.ok(token, "expected a token");
    const result = await verifyTwoFactorApproveToken(token!);
    assert.equal(result.ok, true);
    assert.equal(result.challengeId, CHALLENGE_ID);
  });

  it("rejects a tampered signature", async () => {
    const token = await mintTwoFactorApproveToken(CHALLENGE_ID);
    const [id] = token!.split(".");
    const forged = `${id}.${"0".repeat(64)}`;
    const result = await verifyTwoFactorApproveToken(forged);
    assert.equal(result.ok, false);
  });

  it("rejects a swapped challenge id (signature no longer matches)", async () => {
    const token = await mintTwoFactorApproveToken(CHALLENGE_ID);
    const sig = token!.slice(token!.lastIndexOf(".") + 1);
    const forged = `99999999-2222-4333-8444-555555555555.${sig}`;
    const result = await verifyTwoFactorApproveToken(forged);
    assert.equal(result.ok, false);
  });

  it("rejects malformed / unsigned tokens", async () => {
    for (const bad of ["", "no-dot", ".", "abc.", ".abc"]) {
      const result = await verifyTwoFactorApproveToken(bad);
      assert.equal(result.ok, false, `expected ${JSON.stringify(bad)} to fail`);
    }
  });

  it("fails closed with no signing secret", async () => {
    const saved = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    try {
      assert.equal(await mintTwoFactorApproveToken(CHALLENGE_ID), null);
      assert.equal((await verifyTwoFactorApproveToken("x.y")).ok, false);
    } finally {
      process.env.JWT_SECRET = saved;
    }
  });
});
