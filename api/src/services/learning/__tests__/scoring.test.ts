/**
 * #1344 — SCORM / xAPI scoring-helper tests.
 *
 * `scoring.ts` is the single seam every "did the learner pass?" comparison
 * routes through (gap #1606). It exists specifically to kill the rounding /
 * per-package-scale bugs that bit when routes compared the raw SCORM float
 * against the integer `passing_score_pct` gate directly. These tests pin:
 *
 *   - the basis-point conversion across the SCORM-runtime score scales
 *     (raw/min/max as emitted per-package),
 *   - the documented `null` carve-outs (missing raw, zero/negative range),
 *   - clamping for out-of-range scores,
 *   - the gate comparison at the exact boundary (the 69-vs-70 rounding bug),
 *   - the weighted multi-lesson aggregate, including weight=0 and all-null.
 *
 * Pure module — no DB, no fixtures needed beyond the score triples the
 * SCORM CMI data model actually produces.
 *
 * Run: node --import tsx --test src/services/learning/__tests__/scoring.test.ts
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { toBasisPoints, passesGate, aggregateBasisPoints } from "../scoring.js";

describe("toBasisPoints", () => {
  it("converts a 0..100-scale score to basis points", () => {
    assert.equal(toBasisPoints(85, 0, 100), 8500);
  });

  it("converts a per-package scale (raw=42 of max=50) to the right percent", () => {
    assert.equal(toBasisPoints(42, 0, 50), 8400); // 84.00%
  });

  it("honours a non-zero min (raw=75 in a 50..100 band = 50%)", () => {
    assert.equal(toBasisPoints(75, 50, 100), 5000);
  });

  it("defaults min→0 and max→100 when omitted", () => {
    assert.equal(toBasisPoints(70, null, null), 7000);
    assert.equal(toBasisPoints(70, undefined, undefined), 7000);
  });

  it("returns null when scoreRaw is missing", () => {
    assert.equal(toBasisPoints(null, 0, 100), null);
    assert.equal(toBasisPoints(undefined, 0, 100), null);
  });

  it("returns null for a non-finite raw (NaN / Infinity)", () => {
    assert.equal(toBasisPoints(Number.NaN, 0, 100), null);
    assert.equal(toBasisPoints(Number.POSITIVE_INFINITY, 0, 100), null);
  });

  it("returns null for a zero or inverted range (max <= min)", () => {
    assert.equal(toBasisPoints(50, 100, 100), null); // zero range
    assert.equal(toBasisPoints(50, 100, 0), null); // inverted range
  });

  it("clamps an over-max raw to 100% and a below-min raw to 0%", () => {
    assert.equal(toBasisPoints(120, 0, 100), 10000);
    assert.equal(toBasisPoints(-10, 0, 100), 0);
  });

  it("rounds the documented 68.9999 float case to a stable basis point", () => {
    // raw=69, max=100 read from JSON as 68.9999… — the integer-stable
    // conversion the module exists to provide.
    assert.equal(toBasisPoints(68.9999, 0, 100), 6900);
  });
});

describe("passesGate", () => {
  it("passes when the score clears the percentage gate", () => {
    assert.equal(passesGate({ scoreRaw: 85, scoreMin: 0, scoreMax: 100 }, 70), true);
  });

  it("fails when the score is below the gate", () => {
    assert.equal(passesGate({ scoreRaw: 65, scoreMin: 0, scoreMax: 100 }, 70), false);
  });

  it("passes at the exact boundary (the 70-of-70 rounding bug must stay fixed)", () => {
    assert.equal(passesGate({ scoreRaw: 70, scoreMin: 0, scoreMax: 100 }, 70), true);
  });

  it("fails a null score rather than treating missing as zero-pass", () => {
    assert.equal(passesGate({ scoreRaw: null }, 70), false);
  });

  it("respects a per-package scale against the percent gate", () => {
    // raw=35 of max=50 = 70% — clears a 70% gate exactly.
    assert.equal(passesGate({ scoreRaw: 35, scoreMin: 0, scoreMax: 50 }, 70), true);
    assert.equal(passesGate({ scoreRaw: 34, scoreMin: 0, scoreMax: 50 }, 70), false);
  });

  it("treats a zero gate as always-pass for any real score", () => {
    assert.equal(passesGate({ scoreRaw: 0, scoreMin: 0, scoreMax: 100 }, 0), true);
  });
});

describe("aggregateBasisPoints", () => {
  it("returns null for an empty lesson list", () => {
    assert.equal(aggregateBasisPoints([]), null);
  });

  it("returns null when no lesson carries a usable score", () => {
    assert.equal(
      aggregateBasisPoints([{ scoreRaw: null }, { scoreRaw: null, scoreMax: 0 }]),
      null,
    );
  });

  it("averages equally-weighted scored lessons", () => {
    // 70% and 90% → 80.00% = 8000bp.
    const bp = aggregateBasisPoints([
      { scoreRaw: 7, scoreMin: 0, scoreMax: 10 },
      { scoreRaw: 9, scoreMin: 0, scoreMax: 10 },
    ]);
    assert.equal(bp, 8000);
  });

  it("applies per-lesson weights (a heavier lesson pulls the average)", () => {
    // 100% weight 3 + 0% weight 1 → 30000/4 = 7500bp.
    const bp = aggregateBasisPoints([
      { scoreRaw: 10, scoreMin: 0, scoreMax: 10, weight: 3 },
      { scoreRaw: 0, scoreMin: 0, scoreMax: 10, weight: 1 },
    ]);
    assert.equal(bp, 7500);
  });

  it("treats an unscored lesson as zero in the weighted denominator", () => {
    // Documented behaviour: a missing score falls through as zero so a
    // partially-completed course doesn't accidentally pass. The unscored
    // lesson still contributes its weight to the denominator.
    const bp = aggregateBasisPoints([
      { scoreRaw: 10, scoreMin: 0, scoreMax: 10 }, // 100%
      { scoreRaw: null }, // unscored — weight 1, contributes 0 to numerator
    ]);
    assert.equal(bp, 5000);
  });

  it("ignores lessons whose weight is zero or negative", () => {
    const bp = aggregateBasisPoints([
      { scoreRaw: 8, scoreMin: 0, scoreMax: 10, weight: 1 }, // 80%
      { scoreRaw: 0, scoreMin: 0, scoreMax: 10, weight: 0 }, // dropped
      { scoreRaw: 0, scoreMin: 0, scoreMax: 10, weight: -5 }, // dropped
    ]);
    assert.equal(bp, 8000);
  });
});
