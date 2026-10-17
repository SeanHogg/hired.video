/**
 * Shared text helpers consolidated in W1-E: slugify's legacy (no-NFKD) mode,
 * the escapeHtml strict set, tryExtractJson and parseRoleAlias.
 *
 * Run: node --import tsx --test shared/__tests__/text-helpers.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { slugify } from "../slugify.js";
import { escapeHtml } from "../html-escape.js";
import { tryExtractJson } from "../extract-json.js";
import { parseRoleAlias } from "../user-roles.js";

describe("slugify", () => {
  it("folds diacritics by default", () => {
    assert.equal(slugify("Café Résumé", { fallback: "x" }), "cafe-resume");
  });
  it("stripDiacritics:false reproduces the legacy derivation byte-for-byte", () => {
    assert.equal(slugify("Café Corp", { fallback: "", stripDiacritics: false }), "caf-corp");
  });
  it("uncapped length and empty fallback", () => {
    const long = "a ".repeat(100);
    assert.equal(slugify(long, { fallback: "", maxLen: Number.POSITIVE_INFINITY }).length, 199);
    assert.equal(slugify("!!!", { fallback: "" }), "");
    assert.equal(slugify(null, { fallback: "event" }), "event");
  });
});

describe("escapeHtml", () => {
  it("escapes the strict set & < > \" '", () => {
    assert.equal(escapeHtml(`<a href="x">Tom & Jerry's</a>`), "&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;");
    assert.equal(escapeHtml(null), "");
  });
});

describe("tryExtractJson", () => {
  it("pulls a fenced or chatty object; null on garbage or non-objects", () => {
    assert.deepEqual(tryExtractJson('```json\n{"a":1}\n```'), { a: 1 });
    assert.deepEqual(tryExtractJson('Sure! {"a":2} hope that helps'), { a: 2 });
    assert.equal(tryExtractJson("no json here"), null);
    assert.equal(tryExtractJson("[1,2]"), null);
  });
});

describe("parseRoleAlias", () => {
  it("maps aliases case-insensitively and rejects unknowns", () => {
    assert.equal(parseRoleAlias("JobSeeker"), "job_seeker");
    assert.equal(parseRoleAlias(" Super Admin "), "super_admin");
    assert.equal(parseRoleAlias("business"), "employer");
    assert.equal(parseRoleAlias("constructor"), null);
    assert.equal(parseRoleAlias(""), null);
  });
});
