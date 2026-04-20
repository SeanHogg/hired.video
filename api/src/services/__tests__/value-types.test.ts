/**
 * Tests for the branded value types in shared/value-types.ts.
 *
 * Branding is a compile-time guarantee — TypeScript prevents mixing up
 * UserId and ResumeId at call sites. These runtime tests exercise the
 * parse functions' validation side (reject bad input, accept good) and
 * document the "parse, don't validate" boundary.
 *
 * Run: node --import tsx --test src/services/__tests__/value-types.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  parseUserId,
  parseResumeId,
  parseCompanyId,
  parseSlug,
  parsePrivacy,
  isSlug,
  isPrivacy,
  tryParseUserId,
  tryParseResumeId,
  PRIVACY_VALUES,
} from "../../../../shared/value-types.js";

describe("UUID id parsers", () => {
  const VALID = "11111111-1111-1111-1111-111111111111";

  it("parseUserId / parseResumeId / parseCompanyId accept well-formed UUIDs", () => {
    assert.equal(parseUserId(VALID), VALID);
    assert.equal(parseResumeId(VALID), VALID);
    assert.equal(parseCompanyId(VALID), VALID);
  });

  it("throws with the id kind in the error message when given a non-UUID", () => {
    assert.throws(() => parseUserId("not-a-uuid"), /UserId.*UUID/);
    assert.throws(() => parseResumeId("not-a-uuid"), /ResumeId.*UUID/);
  });

  it("rejects strings that LOOK like UUIDs but have wrong segmentation", () => {
    // Wrong number of chars.
    assert.throws(() => parseUserId("1111-1111-1111-1111-111111111111"));
    // Non-hex chars.
    assert.throws(() => parseUserId("gggggggg-gggg-gggg-gggg-gggggggggggg"));
  });

  it("tryParse variants return null instead of throwing for anonymous / bad input", () => {
    assert.equal(tryParseUserId(null), null);
    assert.equal(tryParseUserId(undefined), null);
    assert.equal(tryParseUserId("bad"), null);
    assert.equal(tryParseUserId(VALID), VALID);
    assert.equal(tryParseResumeId(VALID), VALID);
  });
});

describe("parseSlug", () => {
  it("accepts typical human slugs", () => {
    for (const ok of ["john-smith", "ceo-2025", "a-b-c-d", "person123"]) {
      assert.equal(parseSlug(ok), ok, `should accept "${ok}"`);
    }
  });

  it("rejects UUID-shaped strings (closes the 2026-04-19 query-string bug)", () => {
    assert.throws(
      () => parseSlug("235e11c9-0b21-4a97-9cd1-ab3db085b199"),
      /must not look like a UUID/,
    );
  });

  it("rejects uppercase, underscores, leading/trailing hyphens", () => {
    for (const bad of ["John-Smith", "john smith", "john_smith", "--foo", "bar-"]) {
      assert.throws(() => parseSlug(bad), new RegExp("lowercase|Slug"), `reject "${bad}"`);
    }
  });

  it("rejects too-short / too-long slugs with distinct messages", () => {
    assert.throws(() => parseSlug("ab"), /too short/i);
    assert.throws(() => parseSlug("a".repeat(65)), /too long/i);
  });

  it("isSlug is a type guard that matches the parser's rules", () => {
    assert.equal(isSlug("john-smith"), true);
    assert.equal(isSlug("Not-Valid"), false);
    assert.equal(isSlug("11111111-1111-1111-1111-111111111111"), false);
  });
});

describe("parsePrivacy", () => {
  it("accepts every legal Privacy value", () => {
    for (const p of PRIVACY_VALUES) {
      assert.equal(parsePrivacy(p), p);
    }
  });

  it("rejects unknown values with a descriptive error (no silent fallback to private)", () => {
    // The 2026-04-20 audit flagged handlers that silently fell back to
    // "private" on unknown input — branded parsing makes that impossible.
    assert.throws(() => parsePrivacy("everyone"), /Invalid privacy/);
    assert.throws(() => parsePrivacy(""), /Invalid privacy/);
    assert.throws(() => parsePrivacy("PUBLIC"), /Invalid privacy/);
  });

  it("isPrivacy type guard matches the parser", () => {
    assert.equal(isPrivacy("public"), true);
    assert.equal(isPrivacy("garbage"), false);
  });
});
