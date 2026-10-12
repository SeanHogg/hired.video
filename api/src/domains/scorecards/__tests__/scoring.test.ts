/**
 * Tests for the pure scoring domain rules.
 *
 * These functions are deterministic given their inputs — no DB, no Zod,
 * no HTTP. The tests cover: weighted overall score, max-rating-by-scale,
 * aggregate snapshot tally + average, per-attribute averages.
 *
 * Run: node --import tsx --test src/domains/scorecards/__tests__/scoring.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildAggregateSnapshot,
  buildAttributeAverages,
  computeOverallScore,
  maxRatingForScale,
} from "../scoring.js";

describe("maxRatingForScale", () => {
  it("returns 4 for 1-4 scale", () => {
    assert.equal(maxRatingForScale("1-4"), 4);
  });
  it("returns 5 for 1-5 scale", () => {
    assert.equal(maxRatingForScale("1-5"), 5);
  });
  it("returns 1 for thumbs scale", () => {
    assert.equal(maxRatingForScale("thumbs"), 1);
  });
  it("returns 1 for yes-no scale", () => {
    assert.equal(maxRatingForScale("yes-no"), 1);
  });
});

describe("computeOverallScore", () => {
  const attrs = [
    { id: "a", weight: 1 },
    { id: "b", weight: 1 },
  ];

  it("returns null when no ratings supplied", () => {
    assert.equal(computeOverallScore(attrs, [], "1-4"), null);
  });

  it("returns null when every rating is null", () => {
    assert.equal(
      computeOverallScore(attrs, [
        { attributeId: "a", rating: null },
        { attributeId: "b", rating: null },
      ], "1-4"),
      null,
    );
  });

  it("returns 100 when all ratings are at the scale max", () => {
    assert.equal(
      computeOverallScore(attrs, [
        { attributeId: "a", rating: 4 },
        { attributeId: "b", rating: 4 },
      ], "1-4"),
      100,
    );
  });

  it("returns 25 when all ratings are at the scale min (1 of 4)", () => {
    assert.equal(
      computeOverallScore(attrs, [
        { attributeId: "a", rating: 1 },
        { attributeId: "b", rating: 1 },
      ], "1-4"),
      25,
    );
  });

  it("computes weighted mean — heavier attribute pulls the score", () => {
    // Attribute a (weight 4) rated 4/4, attribute b (weight 1) rated 1/4.
    // Weighted: (4/4 * 4 + 1/4 * 1) / (4 + 1) = (4 + 0.25) / 5 = 0.85 → 85.
    const score = computeOverallScore(
      [
        { id: "a", weight: 4 },
        { id: "b", weight: 1 },
      ],
      [
        { attributeId: "a", rating: 4 },
        { attributeId: "b", rating: 1 },
      ],
      "1-4",
    );
    assert.equal(score, 85);
  });

  it("ignores unrated attributes — partial fill doesn't deflate the score", () => {
    // a rated 4/4, b not rated. Result should be 100, not 50.
    const score = computeOverallScore(attrs, [
      { attributeId: "a", rating: 4 },
    ], "1-4");
    assert.equal(score, 100);
  });

  it("works for 1-5 scale (3/5 across both = 60)", () => {
    assert.equal(
      computeOverallScore(attrs, [
        { attributeId: "a", rating: 3 },
        { attributeId: "b", rating: 3 },
      ], "1-5"),
      60,
    );
  });

  it("works for thumbs scale — 1/1 = 100, 0/1 = 0", () => {
    assert.equal(
      computeOverallScore([{ id: "a", weight: 1 }], [
        { attributeId: "a", rating: 1 },
      ], "thumbs"),
      100,
    );
    assert.equal(
      computeOverallScore([{ id: "a", weight: 1 }], [
        { attributeId: "a", rating: 0 },
      ], "thumbs"),
      0,
    );
  });
});

describe("buildAggregateSnapshot", () => {
  it("returns zero-state for empty submission set", () => {
    const snap = buildAggregateSnapshot([]);
    assert.equal(snap.submissionCount, 0);
    assert.equal(snap.avgScore, null);
    assert.deepEqual(snap.recommendations, {});
  });

  it("counts recommendations and averages scores across submissions", () => {
    const snap = buildAggregateSnapshot([
      { overallRecommendation: "strong_yes", overallScore: 90 },
      { overallRecommendation: "yes", overallScore: 70 },
      { overallRecommendation: "yes", overallScore: 80 },
    ]);
    assert.equal(snap.submissionCount, 3);
    assert.equal(snap.avgScore, 80); // (90+70+80)/3
    assert.deepEqual(snap.recommendations, { strong_yes: 1, yes: 2 });
  });

  it("ignores null/undefined scores in the average", () => {
    const snap = buildAggregateSnapshot([
      { overallRecommendation: "yes", overallScore: 80 },
      { overallRecommendation: null, overallScore: null },
    ]);
    assert.equal(snap.submissionCount, 2);
    assert.equal(snap.avgScore, 80); // only one rated submission
    assert.deepEqual(snap.recommendations, { yes: 1 });
  });

  it("returns null avgScore when no submission has a score", () => {
    const snap = buildAggregateSnapshot([
      { overallRecommendation: "yes", overallScore: null },
    ]);
    assert.equal(snap.avgScore, null);
  });
});

describe("buildAttributeAverages", () => {
  const attrs = [
    { id: "a", name: "Communication" },
    { id: "b", name: "Technical" },
  ];

  it("returns null avg + 0 samples for unrated attribute", () => {
    const out = buildAttributeAverages(attrs, []);
    assert.equal(out.length, 2);
    assert.deepEqual(out[0], {
      attributeId: "a",
      name: "Communication",
      avg: null,
      samples: 0,
    });
  });

  it("computes per-attribute averages with one decimal precision", () => {
    const out = buildAttributeAverages(attrs, [
      { attributeId: "a", rating: 4 },
      { attributeId: "a", rating: 3 },
      { attributeId: "b", rating: 2 },
    ]);
    const a = out.find((x) => x.attributeId === "a")!;
    const b = out.find((x) => x.attributeId === "b")!;
    assert.equal(a.avg, 3.5);
    assert.equal(a.samples, 2);
    assert.equal(b.avg, 2);
    assert.equal(b.samples, 1);
  });

  it("excludes null ratings from the sample count", () => {
    const out = buildAttributeAverages(attrs, [
      { attributeId: "a", rating: 4 },
      { attributeId: "a", rating: null },
    ]);
    const a = out.find((x) => x.attributeId === "a")!;
    assert.equal(a.avg, 4);
    assert.equal(a.samples, 1);
  });
});
