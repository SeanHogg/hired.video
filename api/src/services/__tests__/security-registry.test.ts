/**
 * Tests for the shared security registry — the single source of truth
 * for country gating. If these break, the FE register form, BE signup
 * handler, sanctions check, and SuperAdmin filter all drift in
 * lockstep.
 *
 * Run: node --import tsx --test src/services/__tests__/security-registry.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  ALLOWED_SIGNUP_COUNTRIES,
  SANCTIONED_COUNTRIES,
  isSanctioned,
  canCreateAccount,
  classifySignupEligibility,
} from "../auth/geo.js";

describe("security registry — sanctions", () => {
  it("blocks every OFAC country", () => {
    for (const code of SANCTIONED_COUNTRIES) {
      assert.equal(isSanctioned(code), true, `${code} must be sanctioned`);
    }
  });

  it("is case-insensitive", () => {
    assert.equal(isSanctioned("ir"), true);
    assert.equal(isSanctioned("IR"), true);
    assert.equal(isSanctioned("Ir"), true);
  });

  it("returns false for null/undefined/empty", () => {
    assert.equal(isSanctioned(null), false);
    assert.equal(isSanctioned(undefined), false);
    assert.equal(isSanctioned(""), false);
  });

  it("returns false for an allowed country", () => {
    assert.equal(isSanctioned("US"), false);
    assert.equal(isSanctioned("BR"), false);
  });
});

describe("security registry — canCreateAccount", () => {
  it("allows every listed country", () => {
    for (const code of ALLOWED_SIGNUP_COUNTRIES) {
      assert.equal(canCreateAccount(code), true, `${code} must be allowed`);
    }
  });

  it("denies sanctioned countries even if they were on the allow list", () => {
    for (const code of SANCTIONED_COUNTRIES) {
      assert.equal(canCreateAccount(code), false, `${code} sanctioned must override allow`);
    }
  });

  it("denies countries outside the allowlist", () => {
    // Pick non-NA/SA, non-sanctioned: Germany, Japan, Australia.
    assert.equal(canCreateAccount("DE"), false);
    assert.equal(canCreateAccount("JP"), false);
    assert.equal(canCreateAccount("AU"), false);
  });

  it("fails-open for null/unknown country", () => {
    assert.equal(canCreateAccount(null), true);
    assert.equal(canCreateAccount(undefined), true);
  });
});

describe("security registry — classifySignupEligibility", () => {
  it("returns 'sanctioned' for OFAC", () => {
    assert.equal(classifySignupEligibility("KP"), "sanctioned");
    assert.equal(classifySignupEligibility("CU"), "sanctioned");
  });

  it("returns 'allowed' for NA/SA", () => {
    assert.equal(classifySignupEligibility("US"), "allowed");
    assert.equal(classifySignupEligibility("BR"), "allowed");
  });

  it("returns 'waitlist' for non-allow / non-sanctioned", () => {
    assert.equal(classifySignupEligibility("DE"), "waitlist");
    assert.equal(classifySignupEligibility("JP"), "waitlist");
  });

  it("treats null as allowed (fail-open for cf-ipcountry misses)", () => {
    assert.equal(classifySignupEligibility(null), "allowed");
  });

  it("ranks sanctioned > waitlist (sanctions check runs first)", () => {
    // Even if VE were on the allowlist, sanctions takes precedence.
    assert.equal(classifySignupEligibility("VE"), "sanctioned");
  });
});
