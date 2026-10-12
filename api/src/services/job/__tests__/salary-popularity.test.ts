/**
 * Pure-helper tests for the salary popularity derivation.
 *
 * The DB-backed `getPopularRoles` / `getPopularCities` aren't exercised
 * here — they're thin glue around the pure helpers below + a Drizzle
 * query, and integration tests for them belong with the route tests.
 * What matters most for SEO correctness is that the slug + title +
 * city normalisations are stable, which is exactly what's covered here.
 *
 * Run: node --import tsx --test src/services/job/__tests__/salary-popularity.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  slugifyForSalary,
  normaliseTitle,
  extractCity,
} from "../salary-popularity.js";

// ───────────────────────────────────────────────────────────────────────────
// slugifyForSalary
// ───────────────────────────────────────────────────────────────────────────

describe("slugifyForSalary", () => {
  it("lowercases and dashes", () => {
    assert.equal(slugifyForSalary("Senior Software Engineer"), "senior-software-engineer");
  });

  it("collapses runs of non-alphanumerics", () => {
    assert.equal(slugifyForSalary("React.js / Node.js"), "react-js-node-js");
  });

  it("strips leading and trailing dashes", () => {
    assert.equal(slugifyForSalary("--foo--"), "foo");
  });

  it("returns an empty string for whitespace-only input", () => {
    assert.equal(slugifyForSalary("    "), "");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// normaliseTitle — strips stopwords + punctuation
// ───────────────────────────────────────────────────────────────────────────

describe("normaliseTitle", () => {
  it("drops parens, brackets, and stopword level numerals", () => {
    assert.equal(normaliseTitle("Software Engineer III (Backend)"), "software engineer backend");
  });

  it("collapses internal whitespace", () => {
    assert.equal(normaliseTitle("Data    Scientist"), "data scientist");
  });

  it("preserves slashes (hyphenated multi-roles)", () => {
    // Slashes are allowed by the cleaner so combo titles survive.
    assert.equal(normaliseTitle("Frontend/Backend Engineer"), "frontend/backend engineer");
  });

  it("returns an empty string when the title is pure stopwords", () => {
    assert.equal(normaliseTitle("I II III"), "");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// extractCity — first comma-separated segment, with noise rejection
// ───────────────────────────────────────────────────────────────────────────

describe("extractCity", () => {
  it("picks the first comma-separated segment", () => {
    assert.equal(extractCity("San Francisco, CA"), "San Francisco");
    assert.equal(extractCity("New York City, NY, USA"), "New York City");
  });

  it("rejects 'Remote' / 'Hybrid' noise tokens", () => {
    assert.equal(extractCity("Remote"), null);
    assert.equal(extractCity("Remote, US"), null);
    assert.equal(extractCity("hybrid"), null);
  });

  it("rejects postal codes", () => {
    assert.equal(extractCity("94110"), null);
  });

  it("rejects sub-3-char heads", () => {
    assert.equal(extractCity("NY"), null);
  });

  it("returns null for empty input", () => {
    assert.equal(extractCity(""), null);
    assert.equal(extractCity("   "), null);
  });

  it("keeps a single-city string when no comma is present", () => {
    assert.equal(extractCity("Berlin"), "Berlin");
  });
});
