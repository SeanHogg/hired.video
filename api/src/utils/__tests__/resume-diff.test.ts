/**
 * Tests for the resume-diff utility that drives the variant-lineage UI.
 *
 * Covers:
 *   • canonicalize       — reduces a resume to the signal-bearing subset
 *                         (summary / label / work highlights / skills);
 *                         case-insensitive section key access.
 *   • levenshtein        — iterative two-row edit-distance implementation.
 *   • computeDiffPercent — 0 for identical content, 100 for completely
 *                         different, null when both sides are empty.
 *
 * Keeps variant % drift sane: reformatting or re-ordering must not bump
 * the diff score — only real text tailoring should.
 *
 * Run: node --import tsx --test src/utils/__tests__/resume-diff.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { canonicalize, levenshtein, computeDiffPercent } from "../resume-diff.js";

// ═══════════════════════════════════════════════════════════════════════════
// canonicalize
// ═══════════════════════════════════════════════════════════════════════════

describe("canonicalize", () => {
  it("returns empty string for null / undefined / non-object content", () => {
    assert.equal(canonicalize(null), "");
    assert.equal(canonicalize(undefined), "");
    assert.equal(canonicalize("string" as any), "");
  });

  it("extracts summary + label from basics", () => {
    const canon = canonicalize({
      basics: { summary: "25 years of CTO experience", label: "Technology Leader" },
    });
    assert.match(canon, /25 years of cto experience/);
    assert.match(canon, /technology leader/);
  });

  it("lowercases so case changes don't count as tailoring", () => {
    const a = canonicalize({ basics: { summary: "CTO" } });
    const b = canonicalize({ basics: { summary: "cto" } });
    assert.equal(a, b);
  });

  it("tolerates PascalCase section keys (legacy storage)", () => {
    const camelCase = canonicalize({ basics: { summary: "Leader" } });
    const pascalCase = canonicalize({ Basics: { Summary: "Leader" } });
    assert.equal(camelCase, pascalCase);
  });

  it("includes work highlights but NOT dates/URLs (tailoring signal only)", () => {
    const canon = canonicalize({
      work: [
        {
          name: "Acme",
          position: "CTO",
          summary: "Led everything",
          highlights: ["Shipped X", "Hired Y"],
          startDate: "2020-01",
          endDate: "2023-12",
          url: "https://acme.example",
        },
      ],
    });
    assert.match(canon, /shipped x/);
    assert.match(canon, /hired y/);
    // Dates and URLs are not included — they would otherwise inflate the
    // diff score on trivial reformatting.
    assert.doesNotMatch(canon, /2020-01/);
    assert.doesNotMatch(canon, /acme\.example/);
  });

  it("includes skill names (the resume field most often tailored per job)", () => {
    const canon = canonicalize({
      skills: [{ name: "TypeScript" }, { name: "Rust" }],
    });
    assert.match(canon, /typescript/);
    assert.match(canon, /rust/);
  });

  it("excludes education (rarely rewritten per-variant so it would swamp the signal)", () => {
    const withEdu = canonicalize({
      basics: { summary: "s" },
      education: [{ institution: "MIT", area: "CS" }],
    });
    const withoutEdu = canonicalize({
      basics: { summary: "s" },
    });
    assert.equal(withEdu, withoutEdu, "education must not change canonical form");
  });

  it("produces identical canonical form regardless of property ordering", () => {
    const a = canonicalize({ basics: { summary: "a", label: "b" } });
    const b = canonicalize({ basics: { label: "b", summary: "a" } });
    assert.equal(a, b);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// levenshtein
// ═══════════════════════════════════════════════════════════════════════════

describe("levenshtein", () => {
  it("returns 0 for identical strings (fast-path)", () => {
    assert.equal(levenshtein("", ""), 0);
    assert.equal(levenshtein("abc", "abc"), 0);
  });

  it("returns length-of-other when one side is empty", () => {
    assert.equal(levenshtein("", "hello"), 5);
    assert.equal(levenshtein("hello", ""), 5);
  });

  it("canonical test: kitten → sitting = 3 edits", () => {
    assert.equal(levenshtein("kitten", "sitting"), 3);
  });

  it("is symmetric (a→b distance == b→a distance)", () => {
    for (const [a, b] of [
      ["hello", "world"],
      ["resume", "resumé"],
      ["", "abc"],
      ["abcdef", "acf"],
    ]) {
      assert.equal(levenshtein(a, b), levenshtein(b, a));
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// computeDiffPercent
// ═══════════════════════════════════════════════════════════════════════════

describe("computeDiffPercent", () => {
  it("returns null when both sides have no canonicalizable content", () => {
    assert.equal(computeDiffPercent(null, null), null);
    // Empty objects canonicalize to "\n---\n\n---\n\n---\n" with length > 0,
    // so they return 0 (identical), not null. Null/undefined is the path
    // where canonicalize() produces "", which triggers the null branch.
    assert.equal(computeDiffPercent(undefined, null), null);
  });

  it("returns 0 when both sides canonicalize to the same non-empty placeholder (empty objects)", () => {
    // Two empty objects both produce the same empty-section scaffold.
    assert.equal(computeDiffPercent({}, {}), 0);
  });

  it("returns 0 for identical content", () => {
    const content = {
      basics: { summary: "CTO with 25 years" },
      work: [{ name: "Acme", position: "CTO", highlights: ["A", "B"] }],
      skills: [{ name: "TypeScript" }],
    };
    assert.equal(computeDiffPercent(content, content), 0);
  });

  it("returns 0 for trivially-reformatted content (case changes don't count)", () => {
    const parent = { basics: { summary: "CTO" } };
    const child = { basics: { summary: "cto" } };
    assert.equal(computeDiffPercent(parent, child), 0);
  });

  it("returns a small number when a single bullet is tweaked", () => {
    const parent = {
      basics: { summary: "CTO" },
      work: [{ name: "Acme", position: "CTO", highlights: ["Shipped X"] }],
    };
    const child = {
      basics: { summary: "CTO" },
      work: [{ name: "Acme", position: "CTO", highlights: ["Shipped Xx"] }], // one char added
    };
    const pct = computeDiffPercent(parent, child);
    assert.ok(pct !== null && pct > 0 && pct < 25, `expected small diff, got ${pct}`);
  });

  it("returns a large number when child is totally rewritten", () => {
    const parent = {
      basics: { summary: "CTO and technology leader with 25 years" },
      work: [{ name: "Acme", position: "CTO", highlights: ["Shipped X", "Hired Y"] }],
    };
    const child = {
      basics: { summary: "Software engineer, early career" },
      work: [{ name: "Beta", position: "Intern", highlights: ["Learned Z"] }],
    };
    const pct = computeDiffPercent(parent, child);
    assert.ok(pct !== null && pct > 50, `expected large diff, got ${pct}`);
  });

  it("clamps result to [0, 100]", () => {
    const parent = { basics: { summary: "a".repeat(50) } };
    const child = { basics: { summary: "b".repeat(1000) } };
    const pct = computeDiffPercent(parent, child);
    assert.ok(pct !== null);
    assert.ok(pct! >= 0);
    assert.ok(pct! <= 100);
  });

  it("returns an integer (drift score is stored as an integer column)", () => {
    const pct = computeDiffPercent(
      { basics: { summary: "hello world" } },
      { basics: { summary: "helro world" } },
    );
    assert.ok(pct !== null);
    assert.equal(pct, Math.round(pct!), "must be an integer");
  });
});
