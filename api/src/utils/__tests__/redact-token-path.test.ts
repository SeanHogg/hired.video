/**
 * redactTokenPath — request_logs never stores an emailed-link token.
 *
 * Run: node --import tsx --test src/utils/__tests__/redact-token-path.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { redactTokenPath, TOKEN_PATH_PREFIXES } from "../redact-token-path.js";

const TOKEN = "3f9a1c0e7b2d4a6f8e1c3b5d7f9a2c4e6b8d0f1a3c5e7b9d2f4a6c8e0b1d3f5a";

describe("redactTokenPath", () => {
  it("replaces the candidate-video consent token", () => {
    assert.equal(redactTokenPath(`/api/public/candidate-video-consent/${TOKEN}`), "/api/public/candidate-video-consent/:token");
  });

  it("keeps the path after the token (sub-actions stay groupable)", () => {
    assert.equal(redactTokenPath(`/api/public/screening/${TOKEN}/claim`), "/api/public/screening/:token/claim");
    assert.equal(redactTokenPath(`/api/bookings/r/${TOKEN}/comments`), "/api/bookings/r/:token/comments");
    assert.equal(redactTokenPath(`/api/public/screening/${TOKEN}/items/abc/satisfy`), "/api/public/screening/:token/items/abc/satisfy");
  });

  it("covers every listed prefix", () => {
    for (const prefix of TOKEN_PATH_PREFIXES) {
      const out = redactTokenPath(`${prefix}${TOKEN}`);
      assert.equal(out, `${prefix}:token`, prefix);
      assert.ok(!out.includes(TOKEN), prefix);
    }
  });

  it("leaves other paths and a bare prefix untouched", () => {
    for (const p of [
      "/api/studio/projects/9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a",
      "/api/recruiter/candidate-video-consents",
      "/api/public/candidate-video-consent/",
      "/api/public/candidate-video-consent",
      "/health",
    ]) {
      assert.equal(redactTokenPath(p), p);
    }
  });
});
