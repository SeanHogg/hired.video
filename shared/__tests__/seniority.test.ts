import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SENIORITY_LEVELS,
  SENIORITY_LABELS,
  normalizeSeniority,
} from "../seniority.js";

describe("seniority normalizer (#2090)", () => {
  it("every canonical level has a display label", () => {
    for (const l of SENIORITY_LEVELS) {
      assert.ok(SENIORITY_LABELS[l]);
    }
  });

  it("folds the form PascalCase values to canonical lowercase", () => {
    // The exact options shipped by JobCreatePage's seniority <Select>.
    assert.equal(normalizeSeniority("Entry"), "entry");
    assert.equal(normalizeSeniority("Junior"), "junior");
    assert.equal(normalizeSeniority("Mid"), "mid");
    assert.equal(normalizeSeniority("Senior"), "senior");
    assert.equal(normalizeSeniority("LeadExecutive"), "lead");
  });

  it("the read/scraper lowercase vocabulary passes through unchanged", () => {
    for (const l of ["entry", "mid", "senior", "lead", "executive"] as const) {
      assert.equal(normalizeSeniority(l), l);
    }
  });

  it("the bug class is fixed: a 'Senior' posting matches a 'senior' filter", () => {
    // write spelling === filter spelling after normalization on both sides.
    assert.equal(normalizeSeniority("Senior"), normalizeSeniority("senior"));
  });

  it("collapses separators / casual spellings", () => {
    assert.equal(normalizeSeniority("Sr."), "senior");
    assert.equal(normalizeSeniority("entry-level"), "entry");
    assert.equal(normalizeSeniority("mid_level"), "mid");
    assert.equal(normalizeSeniority("VP"), "executive");
    assert.equal(normalizeSeniority("C-Level"), "executive");
    assert.equal(normalizeSeniority("Director"), "executive");
    assert.equal(normalizeSeniority("Staff"), "lead");
  });

  it("not-specified / empty / unmapped → null (store NULL, not raw)", () => {
    assert.equal(normalizeSeniority("None"), null);
    assert.equal(normalizeSeniority("not specified"), null);
    assert.equal(normalizeSeniority(""), null);
    assert.equal(normalizeSeniority("   "), null);
    assert.equal(normalizeSeniority("banana"), null);
    assert.equal(normalizeSeniority(null), null);
    assert.equal(normalizeSeniority(undefined), null);
  });

});
