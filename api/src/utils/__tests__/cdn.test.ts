/**
 * Unit tests for utils/cdn.ts — cdnUrl().
 *
 * Run: node --import tsx --test src/utils/__tests__/cdn.test.ts
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { cdnUrl } from "../cdn.js";

// Helper: set the CDN_BASE_URL env override for a test, then restore after.
function withEnv(key: string, value: string | undefined) {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  return () => {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  };
}

describe("cdnUrl", () => {
  let restore: (() => void) | undefined;
  afterEach(() => restore?.());

  // ── Relative keys (normal path) ──────────────────────────────────────────

  it("prepends the default CDN base to a relative key", () => {
    restore = withEnv("CDN_BASE_URL", undefined);
    assert.equal(
      cdnUrl("uploads/abc/image.jpg"),
      "https://cdn.hired.video/uploads/abc/image.jpg",
    );
  });

  it("strips a leading slash from the key", () => {
    restore = withEnv("CDN_BASE_URL", undefined);
    assert.equal(
      cdnUrl("/uploads/abc/image.jpg"),
      "https://cdn.hired.video/uploads/abc/image.jpg",
    );
  });

  it("uses CDN_BASE_URL from env when set", () => {
    restore = withEnv("CDN_BASE_URL", "https://custom-cdn.example.com");
    assert.equal(
      cdnUrl("uploads/abc/image.jpg"),
      "https://custom-cdn.example.com/uploads/abc/image.jpg",
    );
  });

  it("strips trailing slashes from the base", () => {
    restore = withEnv("CDN_BASE_URL", "https://custom-cdn.example.com///");
    assert.equal(
      cdnUrl("uploads/abc/image.jpg"),
      "https://custom-cdn.example.com/uploads/abc/image.jpg",
    );
  });

  // ── Absolute URLs (pass-through) ────────────────────────────────────────

  it("returns an https:// URL as-is (no double-prefixing)", () => {
    assert.equal(
      cdnUrl("https://cdn.hired.video/uploads/abc/image.jpg"),
      "https://cdn.hired.video/uploads/abc/image.jpg",
    );
  });

  it("returns an http:// URL as-is", () => {
    assert.equal(
      cdnUrl("http://example.com/avatar.png"),
      "http://example.com/avatar.png",
    );
  });

  it("returns an OAuth provider avatar URL as-is", () => {
    const githubAvatar = "https://avatars.githubusercontent.com/u/12345?v=4";
    assert.equal(cdnUrl(githubAvatar), githubAvatar);
  });

  it("does not double-prefix a CDN URL that is already absolute", () => {
    const full = "https://cdn.hired.video/uploads/9f14dee7/images/6336e9cf.jpg";
    assert.equal(cdnUrl(full), full);
    // Before the fix this would produce:
    // https://cdn.hired.video/https://cdn.hired.video/uploads/9f14dee7/images/6336e9cf.jpg
  });
});
