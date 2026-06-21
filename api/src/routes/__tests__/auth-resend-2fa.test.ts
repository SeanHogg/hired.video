/**
 * Regression test for /api/auth/resend-2fa eligibility.
 *
 * Bug (reported 2026-06-21): resend returned 400 INVALID_TOKEN whenever the
 * prior two-factor code was EXPIRED (or already marked `used`). That defeats
 * the entire purpose of resend — the user clicks "resend" precisely BECAUSE
 * the code they were emailed has lapsed, and the gate locked them out of their
 * own account. Root cause was the handler rejecting any challenge row that was
 * `used` or past `expiresAt`.
 *
 * Fix: `canResendTwoFactor` allows a resend as long as the tempAuthToken
 * resolves to a challenge row with a userId (so we know who to email a fresh
 * code to). Expiry and prior consumption are NOT failure cases. This test pins
 * that contract so the stupid gate can never come back.
 *
 * Run: node --import tsx --test src/routes/__tests__/auth-resend-2fa.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { canResendTwoFactor } from "../auth.js";

const PAST = new Date(Date.now() - 60 * 60 * 1000); // 1h ago
const FUTURE = new Date(Date.now() + 60 * 60 * 1000); // 1h ahead

describe("canResendTwoFactor", () => {
  it("ALLOWS resend when the prior code is EXPIRED (the whole point of resend)", () => {
    // This is the exact case that regressed: code lapsed, user wants a new one.
    assert.equal(
      canResendTwoFactor({ userId: "user-1", used: false, expiresAt: PAST }),
      true,
      "an expired challenge must still be resendable",
    );
  });

  it("ALLOWS resend when the prior code was already marked used", () => {
    // createTwoFactorEntry retires prior codes by flagging them `used`, so a
    // user holding a used token (e.g. after a previous resend) must still be
    // able to request another fresh code.
    assert.equal(
      canResendTwoFactor({ userId: "user-1", used: true, expiresAt: FUTURE }),
      true,
      "a used challenge must still be resendable",
    );
  });

  it("ALLOWS resend when the code is both used AND expired", () => {
    assert.equal(
      canResendTwoFactor({ userId: "user-1", used: true, expiresAt: PAST }),
      true,
    );
  });

  it("ALLOWS resend for a fresh, unused, unexpired challenge", () => {
    assert.equal(
      canResendTwoFactor({ userId: "user-1", used: false, expiresAt: FUTURE }),
      true,
    );
  });

  it("REJECTS only when the token resolved to no challenge at all", () => {
    // A bogus / non-existent tempAuthToken yields no row → no userId to email.
    assert.equal(canResendTwoFactor(undefined), false);
    assert.equal(canResendTwoFactor(null), false);
  });

  it("REJECTS a challenge row missing its userId (cannot address the email)", () => {
    assert.equal(canResendTwoFactor({ userId: "" } as any), false);
  });

  it("does NOT consider `used` or `expiresAt` in the decision (anti-regression pin)", () => {
    // Explicitly assert that toggling used/expiresAt never changes the verdict
    // for a valid userId — if a future edit re-adds either gate, this fails.
    for (const used of [true, false, undefined]) {
      for (const expiresAt of [PAST, FUTURE, undefined]) {
        assert.equal(
          canResendTwoFactor({ userId: "user-1", used, expiresAt }),
          true,
          `userId present ⇒ resend allowed (used=${used}, expiresAt=${expiresAt})`,
        );
      }
    }
  });
});
