/**
 * Tests for the disposable-email blocklist.
 *
 * Run: node --import tsx --test src/services/__tests__/disposable-email.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isDisposableEmail } from "../auth/disposableEmail.js";

describe("disposable email blocklist", () => {
  it("rejects known throwaway providers", () => {
    assert.equal(isDisposableEmail("foo@mailinator.com"), true);
    assert.equal(isDisposableEmail("foo@10minutemail.com"), true);
    assert.equal(isDisposableEmail("foo@guerrillamail.com"), true);
    assert.equal(isDisposableEmail("foo@yopmail.com"), true);
  });

  it("is case-insensitive on the domain", () => {
    assert.equal(isDisposableEmail("foo@MAILINATOR.COM"), true);
    assert.equal(isDisposableEmail("foo@MailInator.Com"), true);
  });

  it("allows real providers", () => {
    assert.equal(isDisposableEmail("foo@gmail.com"), false);
    assert.equal(isDisposableEmail("foo@hired.video"), false);
    assert.equal(isDisposableEmail("foo@example.org"), false);
  });

  it("returns false for malformed addresses (no @)", () => {
    assert.equal(isDisposableEmail("notanemail"), false);
  });

  it("does not match subdomains of disposable parents (documented gap)", () => {
    // Documented limitation in the source: subdomains aren't auto-caught.
    // If this becomes a real abuse vector, add explicit subdomain entries.
    assert.equal(isDisposableEmail("foo@a.mailinator.com"), false);
  });
});
