/**
 * Pure-helper tests for the assessment-norms calibration math —
 * the bit that converts a population of raw 0..1 dimension scores
 * into a 101-entry percentile curve, plus the binary-search that
 * looks up a single score's percentile band against that curve.
 *
 * DB-backed fetchNorm is exercised at the route layer; the math
 * below is what makes the percentile bands defensible, so it has
 * its own tight unit coverage.
 *
 * Run: node --import tsx --test src/services/assessments/__tests__/norms.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { computePercentileCurve, percentileForScore } from "../norms.js";

describe("computePercentileCurve", () => {
  it("returns null for an under-25-sample population", () => {
    assert.equal(computePercentileCurve([0.5, 0.6, 0.7]), null);
    assert.equal(computePercentileCurve(Array.from({ length: 24 }, (_, i) => i / 24)), null);
  });

  it("returns a 101-entry array for a 25+ sample", () => {
    const scores = Array.from({ length: 25 }, (_, i) => i / 25);
    const curve = computePercentileCurve(scores)!;
    assert.equal(curve.length, 101);
  });

  it("is monotonically non-decreasing", () => {
    const scores = Array.from({ length: 200 }, () => Math.random());
    const curve = computePercentileCurve(scores)!;
    for (let i = 1; i < curve.length; i++) {
      assert.ok(curve[i] >= curve[i - 1], `curve drops at index ${i}: ${curve[i - 1]} → ${curve[i]}`);
    }
  });

  it("anchors p0 to min and p100 to max", () => {
    const scores = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5,
                    0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 0.99,
                    0.01, 0.02, 0.03, 0.04, 0.06];
    const curve = computePercentileCurve(scores)!;
    assert.ok(curve[0] <= 0.05);
    assert.ok(curve[100] >= 0.95);
  });

  it("ignores non-finite inputs", () => {
    const scores = [...Array.from({ length: 25 }, (_, i) => i / 25), NaN, Infinity, undefined as any];
    const curve = computePercentileCurve(scores)!;
    assert.equal(curve.length, 101);
  });
});

describe("percentileForScore", () => {
  // Build a deterministic curve: percentile p has raw score p/100.
  const linearCurve = Array.from({ length: 101 }, (_, p) => p / 100);

  it("returns 0 for scores at or below the floor", () => {
    assert.equal(percentileForScore(linearCurve, 0), 0);
    assert.equal(percentileForScore(linearCurve, -0.1), 0);
  });

  it("returns 100 for scores at or above the ceiling", () => {
    assert.equal(percentileForScore(linearCurve, 1), 100);
    assert.equal(percentileForScore(linearCurve, 2), 100);
  });

  it("returns the correct band for mid-range scores", () => {
    assert.equal(percentileForScore(linearCurve, 0.5), 50);
    assert.equal(percentileForScore(linearCurve, 0.25), 25);
    assert.equal(percentileForScore(linearCurve, 0.75), 75);
  });

  it("handles an empty curve safely (defaults to median)", () => {
    assert.equal(percentileForScore([], 0.5), 50);
  });

  it("works with a single-entry curve", () => {
    assert.equal(percentileForScore([0.5], 0.5), 0);
    assert.equal(percentileForScore([0.5], 0.7), 100);
  });
});
