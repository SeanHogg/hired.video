/**
 * Pure-function tests for the predictive-assessments scorer. The
 * function is pure (descriptor + questions + responses → scores), so
 * we don't need a DB or HTTP layer to lock down its behaviour:
 * agreement-scale normalisation, reverse-scored items, multiple-choice
 * scoring, dimension averaging, inverse dimensions, and the overall
 * mean.
 *
 * Run: node --import tsx --test shared/__tests__/assessments-scoring.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  computeScore,
  scoreBand,
} from "../assessments/scoring.js";
import type { AssessmentDescriptor } from "../assessments/kinds.js";
import type { AssessmentQuestion } from "../assessments/question-banks.js";

const FIVE_FACTOR_DESCRIPTOR: AssessmentDescriptor = {
  kind: "big_five",
  title: "Big Five",
  oneLiner: "",
  longDescription: "",
  tier: "free",
  estimatedMinutes: 5,
  questionCount: 4,
  inspiredBy: "test",
  dimensions: [
    { key: "openness", label: "Openness", blurb: "" },
    { key: "neuroticism", label: "Emotional Stability", blurb: "", inverse: true },
  ],
};

const FIVE_FACTOR_QUESTIONS: AssessmentQuestion[] = [
  { id: "o1", dimension: "openness", prompt: "...", scale: "agreement_5" },
  { id: "o2", dimension: "openness", prompt: "...", scale: "agreement_5", reverseScored: true },
  { id: "n1", dimension: "neuroticism", prompt: "...", scale: "agreement_5" },
  { id: "n2", dimension: "neuroticism", prompt: "...", scale: "agreement_5", reverseScored: true },
];

describe("computeScore — agreement scale + reverse + inverse", () => {
  it("normalises a 5-point agreement scale to 0..1", () => {
    const r = computeScore(FIVE_FACTOR_DESCRIPTOR, FIVE_FACTOR_QUESTIONS, [
      { questionId: "o1", value: 5 }, // 1.0
      { questionId: "o2", value: 1 }, // reverse → 1.0
    ]);
    assert.equal(r.scores.openness, 1);
  });

  it("applies reverseScored on the question", () => {
    const r = computeScore(FIVE_FACTOR_DESCRIPTOR, FIVE_FACTOR_QUESTIONS, [
      { questionId: "o2", value: 5 }, // reverse → 0
    ]);
    assert.equal(r.scores.openness, 0);
  });

  it("flips dimension via descriptor.inverse so 'higher is better' holds", () => {
    // Neuroticism axis: raw high → bad. Descriptor marks it inverse so
    // a high raw becomes a low Emotional Stability score on the result.
    const r = computeScore(FIVE_FACTOR_DESCRIPTOR, FIVE_FACTOR_QUESTIONS, [
      { questionId: "n1", value: 5 }, // strongly neurotic
    ]);
    assert.equal(r.scores.neuroticism, 0); // inverse → low emotional stability
  });

  it("averages multiple questions per dimension", () => {
    const r = computeScore(FIVE_FACTOR_DESCRIPTOR, FIVE_FACTOR_QUESTIONS, [
      { questionId: "o1", value: 5 }, // 1.0
      { questionId: "o2", value: 5 }, // reverse → 0.0
    ]);
    assert.equal(r.scores.openness, 0.5);
  });

  it("emits per-dimension counts and overall mean", () => {
    const r = computeScore(FIVE_FACTOR_DESCRIPTOR, FIVE_FACTOR_QUESTIONS, [
      { questionId: "o1", value: 4 }, // 0.75
      { questionId: "n1", value: 2 }, // raw 0.25 → inverse 0.75
    ]);
    assert.equal(r.counts.openness, 1);
    assert.equal(r.counts.neuroticism, 1);
    assert.equal(r.scores.openness, 0.75);
    assert.equal(r.scores.neuroticism, 0.75);
    assert.equal(r.overall, 0.75);
  });

  it("ignores responses to unknown question ids", () => {
    const r = computeScore(FIVE_FACTOR_DESCRIPTOR, FIVE_FACTOR_QUESTIONS, [
      { questionId: "ghost", value: 5 },
      { questionId: "o1", value: 3 }, // 0.5
    ]);
    assert.equal(r.scores.openness, 0.5);
    assert.equal(r.counts.openness, 1);
  });
});

describe("computeScore — multiple choice", () => {
  const descriptor: AssessmentDescriptor = {
    kind: "cognitive_sample",
    title: "Cog",
    oneLiner: "",
    longDescription: "",
    tier: "free",
    estimatedMinutes: 3,
    questionCount: 1,
    inspiredBy: "",
    dimensions: [{ key: "numerical", label: "Numerical", blurb: "" }],
  };
  const questions: AssessmentQuestion[] = [
    {
      id: "q1",
      dimension: "numerical",
      prompt: "?",
      scale: "multiple_choice",
      options: [
        { value: "a", label: "a", score: 0 },
        { value: "b", label: "b", score: 1 },
      ],
    },
  ];

  it("awards the option's score on a correct pick", () => {
    const r = computeScore(descriptor, questions, [{ questionId: "q1", value: "b" }]);
    assert.equal(r.scores.numerical, 1);
  });

  it("awards 0 on an incorrect pick", () => {
    const r = computeScore(descriptor, questions, [{ questionId: "q1", value: "a" }]);
    assert.equal(r.scores.numerical, 0);
  });

  it("clamps option.score into 0..1", () => {
    const wild: AssessmentQuestion[] = [
      {
        id: "q1",
        dimension: "numerical",
        prompt: "?",
        scale: "multiple_choice",
        options: [{ value: "x", label: "x", score: 999 }],
      },
    ];
    const r = computeScore(descriptor, wild, [{ questionId: "q1", value: "x" }]);
    assert.equal(r.scores.numerical, 1);
  });
});

describe("scoreBand", () => {
  it("buckets a 0..1 score into the canonical five labels", () => {
    assert.equal(scoreBand(0.0), "very-low");
    assert.equal(scoreBand(0.19), "very-low");
    assert.equal(scoreBand(0.2), "low");
    assert.equal(scoreBand(0.4), "average");
    assert.equal(scoreBand(0.6), "high");
    assert.equal(scoreBand(0.8), "very-high");
    assert.equal(scoreBand(1.0), "very-high");
  });
});
