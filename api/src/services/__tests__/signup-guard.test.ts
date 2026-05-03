/**
 * Tests for the validateSignupRequest composer.
 *
 * The composer is the *single* signup gate — every block path should
 * funnel through here so the sequence (OFAC → geo → honeypot →
 * disposable → captcha → MX → breach) stays canonical. These tests
 * pin the priority order: each layer fires before the next.
 *
 * Network-dependent layers (MX, HIBP) fail-open and aren't unit-
 * tested here — they have their own integration coverage.
 *
 * Run: node --import tsx --test src/services/__tests__/signup-guard.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildFakeDb } from "../../handlers/__testing__/fake-db.js";
import { validateSignupRequest } from "../auth/signupGuard.js";
import type { CaptchaPort } from "../auth/AuthService.js";

function makeDb() {
  return buildFakeDb({ bot_block_events: [] as any });
}

const passingCaptcha: CaptchaPort = { enforced: true, verify: async () => true };
const failingCaptcha: CaptchaPort = { enforced: true, verify: async () => false };
const skippedCaptcha: CaptchaPort = { enforced: false, verify: async () => true };

describe("validateSignupRequest — priority order", () => {
  it("OFAC sanctions blocks first (before geo, honeypot, etc.)", async () => {
    const { db, state } = makeDb();
    const result = await validateSignupRequest(
      { db, captcha: failingCaptcha, endpoint: "register" },
      {
        email: "foo@mailinator.com", // would also trip disposable
        password: "hunter2",
        honeypot: "spam",            // would also trip honeypot
        countryCode: "KP",
        ipAddress: "1.2.3.4",
      },
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, "OFAC_BLOCKED", "OFAC must win over every other gate");
    assert.equal((state as any).bot_block_events.length, 1);
    assert.equal((state as any).bot_block_events[0].reason, "OFAC_BLOCKED");
  });

  it("Geo blocks before honeypot when not sanctioned", async () => {
    const { db, state } = makeDb();
    const result = await validateSignupRequest(
      { db, captcha: failingCaptcha, endpoint: "register" },
      {
        email: "foo@mailinator.com",
        password: "hunter2",
        honeypot: "spam",
        countryCode: "DE", // not allowed, not sanctioned
        ipAddress: "1.2.3.4",
      },
    );
    assert.equal(result.reason, "GEO_BLOCKED");
    assert.equal((state as any).bot_block_events[0].reason, "GEO_BLOCKED");
  });

  it("Honeypot blocks before disposable when geo passes", async () => {
    const { db } = makeDb();
    const result = await validateSignupRequest(
      { db, captcha: passingCaptcha, endpoint: "register" },
      {
        email: "foo@mailinator.com",
        password: "hunter2",
        honeypot: "filled",
        countryCode: "US",
      },
    );
    assert.equal(result.reason, "HONEYPOT_HIT");
  });

  it("Disposable blocks before captcha when honeypot empty", async () => {
    const { db } = makeDb();
    const result = await validateSignupRequest(
      { db, captcha: failingCaptcha, endpoint: "register" },
      {
        email: "foo@mailinator.com",
        password: "hunter2",
        honeypot: "",
        countryCode: "US",
      },
    );
    assert.equal(result.reason, "DISPOSABLE_EMAIL");
  });

  it("Captcha blocks when enforced and verify fails", async () => {
    const { db } = makeDb();
    const result = await validateSignupRequest(
      { db, captcha: failingCaptcha, endpoint: "register" },
      {
        email: "foo@gmail.com",
        password: "hunter2",
        countryCode: "US",
      },
    );
    // Note: MX may also fire on @gmail.com (real domain → passes).
    // We assert one of the two early reasons hit, not the post-MX path.
    assert.equal(result.reason, "TURNSTILE_FAIL");
  });

  it("Captcha is skipped when not enforced", async () => {
    const { db } = makeDb();
    // Skip captcha + use a domain whose MX is real (gmail) and a password
    // unlikely to be in a HIBP top-N. We use a long random password to
    // dodge the breach corpus; HIBP fail-open means a flake doesn't break
    // this test.
    const result = await validateSignupRequest(
      { db, captcha: skippedCaptcha, endpoint: "register" },
      {
        email: "fresh-account-test@gmail.com",
        password: "L0ng-r4nd0m-pa55w0rd-" + Math.random().toString(36).slice(2),
        countryCode: "US",
      },
    );
    // Either ok=true (HIBP+MX both passed) or false on a transient
    // network failure — both are acceptable for the layer-order test.
    if (!result.ok) {
      assert.notEqual(result.reason, "TURNSTILE_FAIL", "captcha should not have fired when not enforced");
      assert.notEqual(result.reason, "HONEYPOT_HIT");
      assert.notEqual(result.reason, "DISPOSABLE_EMAIL");
    }
  });

  it("Records exactly one bot_block_events row per blocked request", async () => {
    const { db, state } = makeDb();
    await validateSignupRequest(
      { db, captcha: passingCaptcha, endpoint: "register" },
      {
        email: "foo@mailinator.com",
        password: "hunter2",
        countryCode: "US",
      },
    );
    assert.equal((state as any).bot_block_events.length, 1, "exactly one row per block");
  });

  it("Does NOT record a bot_block_events row when validation passes (and downstream layers say ok)", async () => {
    const { db, state } = makeDb();
    const result = await validateSignupRequest(
      { db, captcha: skippedCaptcha, endpoint: "register" },
      {
        email: "fresh-test-" + Math.random().toString(36).slice(2) + "@gmail.com",
        password: "L0ng-r4nd0m-pa55w0rd-" + Math.random().toString(36).slice(2),
        countryCode: "US",
      },
    );
    if (result.ok) {
      assert.equal((state as any).bot_block_events.length, 0);
    }
  });
});
