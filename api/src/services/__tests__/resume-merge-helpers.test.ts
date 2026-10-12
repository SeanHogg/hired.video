/**
 * Tests for the pure helpers that power resume merge analysis.
 *
 * Covers:
 *   • normalizeString            — strip company suffixes (Inc / LLC / etc.)
 *                                   + punctuation + lowercase
 *   • levenshteinDistance        — classic edit distance
 *   • levenshteinRatio           — 0-1 similarity on normalised strings
 *   • mergeHighlights            — union of bullets, de-duplicated
 *   • mergeKeywords              — union of keywords, de-duplicated
 *   • computeHighlightDiff       — counts onlyInSource / onlyInTarget / shared
 *
 * These are the deterministic parts of the merge pipeline that the UI
 * uses to drive its auto/manual/skip decisions. AI-backed paths live in
 * the existing resume-tools + resume-parse test suites.
 *
 * Run: node --import tsx --test src/services/__tests__/resume-merge-helpers.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeString,
  levenshteinDistance,
  levenshteinRatio,
  mergeHighlights,
  mergeKeywords,
  computeHighlightDiff,
} from "../resume/merge.js";

// ═══════════════════════════════════════════════════════════════════════════
// normalizeString
// ═══════════════════════════════════════════════════════════════════════════

describe("normalizeString", () => {
  it("lowercases + strips punctuation + collapses whitespace", () => {
    assert.equal(normalizeString("ACME, Inc!!!"), "acme");
    assert.equal(normalizeString("  Foo  Bar  "), "foo bar");
  });

  it("strips company suffixes so 'Acme Inc' and 'Acme' merge on identity", () => {
    assert.equal(normalizeString("Acme Inc"), normalizeString("Acme"));
    assert.equal(normalizeString("Acme Corp"), normalizeString("Acme"));
    assert.equal(normalizeString("Acme LLC"), normalizeString("Acme"));
    assert.equal(normalizeString("Acme Ltd."), normalizeString("Acme"));
    assert.equal(normalizeString("Acme GmbH"), normalizeString("Acme"));
    assert.equal(normalizeString("Acme Holdings"), normalizeString("Acme"));
  });

  it("tolerates null/undefined/empty input", () => {
    assert.equal(normalizeString(""), "");
    assert.equal(normalizeString(undefined as any), "");
    assert.equal(normalizeString(null as any), "");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Levenshtein
// ═══════════════════════════════════════════════════════════════════════════

describe("levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    assert.equal(levenshteinDistance("hello", "hello"), 0);
    assert.equal(levenshteinDistance("", ""), 0);
  });

  it("returns length-of-other when one side is empty", () => {
    assert.equal(levenshteinDistance("", "hello"), 5);
    assert.equal(levenshteinDistance("hello", ""), 5);
  });

  it("computes single-char edits correctly", () => {
    assert.equal(levenshteinDistance("cat", "cats"), 1);  // insertion
    assert.equal(levenshteinDistance("cats", "cat"), 1);  // deletion
    assert.equal(levenshteinDistance("cat", "bat"), 1);   // substitution
  });

  it("handles the canonical kitten/sitting example (distance = 3)", () => {
    assert.equal(levenshteinDistance("kitten", "sitting"), 3);
  });
});

describe("levenshteinRatio", () => {
  it("returns 1.0 for identical strings", () => {
    assert.equal(levenshteinRatio("hello", "hello"), 1);
  });

  it("returns 1.0 when both strings are empty", () => {
    assert.equal(levenshteinRatio("", ""), 1);
  });

  it("returns 0 when exactly one side is empty", () => {
    assert.equal(levenshteinRatio("", "hello"), 0);
    assert.equal(levenshteinRatio("hello", ""), 0);
  });

  it("returns 1.0 for inputs that normalise to the same string (company suffixes)", () => {
    assert.equal(levenshteinRatio("Acme Inc", "Acme"), 1);
    assert.equal(levenshteinRatio("Acme, LLC!", "acme"), 1);
  });

  it("returns a value between 0 and 1 for partial matches", () => {
    const r = levenshteinRatio("software engineer", "senior software engineer");
    assert.ok(r > 0 && r < 1);
    assert.ok(r > 0.5, "should be high similarity");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// mergeHighlights / mergeKeywords
// ═══════════════════════════════════════════════════════════════════════════

describe("mergeHighlights", () => {
  it("returns source bullets as-is when target is empty", () => {
    assert.deepEqual(mergeHighlights(["a", "b"], []), ["a", "b"]);
  });

  it("returns target bullets as-is when source is empty", () => {
    assert.deepEqual(mergeHighlights([], ["a", "b"]), ["a", "b"]);
  });

  it("de-duplicates when source and target share identical bullets", () => {
    const merged = mergeHighlights(["shipped X", "owned Y"], ["shipped X", "drove Z"]);
    // No duplicate "shipped X" in result.
    const counts = new Map<string, number>();
    for (const h of merged) counts.set(h, (counts.get(h) ?? 0) + 1);
    assert.equal(counts.get("shipped X"), 1);
  });

  it("preserves all unique bullets from both sides", () => {
    const merged = mergeHighlights(["a"], ["b"]);
    assert.ok(merged.includes("a"));
    assert.ok(merged.includes("b"));
    assert.equal(merged.length, 2);
  });
});

describe("mergeKeywords", () => {
  it("union of keywords, de-duplicated", () => {
    const merged = mergeKeywords(["AWS", "React"], ["React", "Node.js"]);
    assert.equal(new Set(merged).size, merged.length, "no duplicates");
    assert.ok(merged.includes("AWS"));
    assert.ok(merged.includes("React"));
    assert.ok(merged.includes("Node.js"));
  });

  it("returns empty array when both sides are empty", () => {
    assert.deepEqual(mergeKeywords([], []), []);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// computeHighlightDiff
// ═══════════════════════════════════════════════════════════════════════════

describe("computeHighlightDiff", () => {
  // Signature is (sourceItem, targetItem) — takes section items and looks
  // up `.highlights` internally. This matches how the merge analyser
  // drives the UI's per-entry bullet diff.

  it("counts only-in-source, only-in-target, and shared bullets", () => {
    const diff = computeHighlightDiff(
      { highlights: ["a", "b", "c"] },
      { highlights: ["b", "c", "d"] },
    );
    // "a" is only in source, "d" is only in target, "b" and "c" are shared.
    assert.equal(diff.onlyInSource, 1);
    assert.equal(diff.onlyInTarget, 1);
    assert.equal(diff.shared, 2);
  });

  it("handles empty / missing highlights arrays", () => {
    assert.deepEqual(computeHighlightDiff({}, {}), { onlyInSource: 0, onlyInTarget: 0, shared: 0 });
    assert.deepEqual(
      computeHighlightDiff({ highlights: ["a"] }, {}),
      { onlyInSource: 1, onlyInTarget: 0, shared: 0 },
    );
    assert.deepEqual(
      computeHighlightDiff({}, { highlights: ["a"] }),
      { onlyInSource: 0, onlyInTarget: 1, shared: 0 },
    );
  });

  it("tolerates null/undefined items (robustness at merge boundaries)", () => {
    assert.deepEqual(
      computeHighlightDiff(null, null),
      { onlyInSource: 0, onlyInTarget: 0, shared: 0 },
    );
    assert.deepEqual(
      computeHighlightDiff(undefined, { highlights: ["a"] }),
      { onlyInSource: 0, onlyInTarget: 1, shared: 0 },
    );
  });
});
