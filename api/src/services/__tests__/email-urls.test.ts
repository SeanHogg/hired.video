/**
 * Tests for the transactional-email URL builders.
 *
 * Covers:
 *   • buildVerifyUrl         — email verification link
 *   • buildPasswordResetUrl  — password reset link
 *
 * These produce the links embedded in every transactional email
 * (verification, reset, 2FA, magic link, connection request). A bug in
 * these builders means users can't complete their flow — high-value
 * one-liner to pin.
 *
 * Run: node --import tsx --test src/services/__tests__/email-urls.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildVerifyUrl, buildPasswordResetUrl } from "../adapters/email.js";

describe("buildVerifyUrl", () => {
  it("embeds the token in a ?token=... query string", () => {
    const url = buildVerifyUrl("abc123");
    assert.match(url, /\/verify-email\?token=abc123$/);
  });

  it("percent-encodes tokens that contain URL-reserved characters", () => {
    // Tokens come from crypto.getRandomValues() as hex strings so this is
    // defense-in-depth, but the encodeURIComponent call must remain so
    // future token formats can't break the query string.
    const url = buildVerifyUrl("abc+def/ghi=xyz");
    assert.match(url, /token=abc%2Bdef%2Fghi%3Dxyz$/);
  });

  it("produces a URL with a valid absolute base", () => {
    const url = buildVerifyUrl("any");
    assert.match(url, /^https?:\/\/[^\s]+\/verify-email\?token=any$/);
  });
});

describe("buildPasswordResetUrl", () => {
  it("embeds the token in a ?token=... query string on the reset-password path", () => {
    const url = buildPasswordResetUrl("reset-xyz");
    assert.match(url, /\/reset-password\?token=reset-xyz$/);
  });

  it("percent-encodes tokens that contain URL-reserved characters", () => {
    const url = buildPasswordResetUrl("reset/token+value=1");
    assert.match(url, /token=reset%2Ftoken%2Bvalue%3D1$/);
  });

  it("produces a URL with a valid absolute base", () => {
    const url = buildPasswordResetUrl("any");
    assert.match(url, /^https?:\/\/[^\s]+\/reset-password\?token=any$/);
  });

  it("verify and reset URLs target different paths (tokens are not cross-reusable)", () => {
    const v = buildVerifyUrl("t");
    const r = buildPasswordResetUrl("t");
    assert.notEqual(v, r);
    assert.ok(v.includes("/verify-email"));
    assert.ok(r.includes("/reset-password"));
  });
});
