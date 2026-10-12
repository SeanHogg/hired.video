/**
 * Unit tests for evaluateCourseCompletion (the helper extracted from
 * the `PATCH /enrollments/:id/progress` route).
 *
 * Anchors:
 *   - The text_md-only seed-course regression (user reported 4/4
 *     lessons green, course still "in progress") MUST stay fixed: a
 *     course with no scored lessons completes purely on
 *     all-required-lessons-passed.
 *   - Courses with mixed scored + unscored lessons still respect
 *     `passingScorePct` against the average of scored lessons only.
 *   - Idempotency: re-firing a passed-progress write doesn't re-flip a
 *     course that was already passed.
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { evaluateCourseCompletion } from "../course-completion.js";

describe("evaluateCourseCompletion", () => {
  it("flips a no-quiz text_md course to passed once every required lesson is passed", () => {
    // Mirrors the seeded "AI Fundamentals for Job Seekers" course
    // shape: four required text_md lessons, no scoreRaw anywhere.
    const lessons = [
      { id: "l1", isRequired: true },
      { id: "l2", isRequired: true },
      { id: "l3", isRequired: true },
      { id: "l4", isRequired: true },
    ];
    const progress = {
      l1: { status: "passed" },
      l2: { status: "passed" },
      l3: { status: "passed" },
      l4: { status: "passed" },
    };
    const result = evaluateCourseCompletion({
      wasPassed: false,
      // BEFORE the fix, the seed migration stamped 70 here; the route
      // computed `0 >= 70` and never flipped. The carve-out below makes
      // the unscored-course case complete despite the legacy 70 stamp.
      passingScorePct: 70,
      lessons,
      progress,
    });
    assert.equal(result.shouldFlipToPassed, true);
    assert.equal(result.finalScorePct, null);
    assert.equal(result.allRequiredPassed, true);
    assert.equal(result.meetsPassingScore, true);
    assert.equal(result.scoredLessonCount, 0);
  });

  it("does NOT flip when one required lesson is still not passed", () => {
    const result = evaluateCourseCompletion({
      wasPassed: false,
      passingScorePct: null,
      lessons: [
        { id: "l1", isRequired: true },
        { id: "l2", isRequired: true },
      ],
      progress: {
        l1: { status: "passed" },
        l2: { status: "in_progress" },
      },
    });
    assert.equal(result.shouldFlipToPassed, false);
    assert.equal(result.passedRequiredCount, 1);
    assert.equal(result.requiredCount, 2);
  });

  it("ignores optional lessons when computing required-completion", () => {
    const result = evaluateCourseCompletion({
      wasPassed: false,
      passingScorePct: null,
      lessons: [
        { id: "l1", isRequired: true },
        { id: "l2", isRequired: false }, // optional — even unfinished, course passes
      ],
      progress: { l1: { status: "passed" } },
    });
    assert.equal(result.shouldFlipToPassed, true);
  });

  it("enforces passingScorePct when at least one lesson reports a score", () => {
    // Mixed course: one quiz lesson scored 50%, course requires 70%.
    const result = evaluateCourseCompletion({
      wasPassed: false,
      passingScorePct: 70,
      lessons: [
        { id: "l1", isRequired: true },
        { id: "l2", isRequired: true },
      ],
      progress: {
        l1: { status: "passed", scoreRaw: 5, scoreMax: 10 }, // 50%
        l2: { status: "passed" },
      },
    });
    assert.equal(result.shouldFlipToPassed, false);
    assert.equal(result.finalScorePct, 50);
    assert.equal(result.meetsPassingScore, false);
  });

  it("flips when the scored lesson clears the passingScorePct threshold", () => {
    const result = evaluateCourseCompletion({
      wasPassed: false,
      passingScorePct: 70,
      lessons: [
        { id: "l1", isRequired: true },
        { id: "l2", isRequired: true },
      ],
      progress: {
        l1: { status: "passed", scoreRaw: 8, scoreMax: 10 }, // 80%
        l2: { status: "passed" },
      },
    });
    assert.equal(result.shouldFlipToPassed, true);
    assert.equal(result.finalScorePct, 80);
  });

  it("averages across multiple scored lessons", () => {
    const result = evaluateCourseCompletion({
      wasPassed: false,
      passingScorePct: 75,
      lessons: [
        { id: "l1", isRequired: true },
        { id: "l2", isRequired: true },
      ],
      progress: {
        l1: { status: "passed", scoreRaw: 7, scoreMax: 10 }, // 70%
        l2: { status: "passed", scoreRaw: 9, scoreMax: 10 }, // 90%
      },
    });
    // Average = 80%, clears 75% threshold.
    assert.equal(result.finalScorePct, 80);
    assert.equal(result.shouldFlipToPassed, true);
  });

  it("is idempotent — a course already passed doesn't re-flip", () => {
    const result = evaluateCourseCompletion({
      wasPassed: true,
      passingScorePct: null,
      lessons: [{ id: "l1", isRequired: true }],
      progress: { l1: { status: "passed" } },
    });
    assert.equal(result.shouldFlipToPassed, false);
    assert.equal(result.allRequiredPassed, true);
  });

  it("never flips a course with zero required lessons", () => {
    const result = evaluateCourseCompletion({
      wasPassed: false,
      passingScorePct: null,
      lessons: [{ id: "l1", isRequired: false }],
      progress: { l1: { status: "passed" } },
    });
    assert.equal(result.shouldFlipToPassed, false);
    assert.equal(result.requiredCount, 0);
  });

  it("skips score lessons missing scoreMax — they don't pollute the denominator", () => {
    const result = evaluateCourseCompletion({
      wasPassed: false,
      passingScorePct: 70,
      lessons: [
        { id: "l1", isRequired: true },
        { id: "l2", isRequired: true },
      ],
      progress: {
        l1: { status: "passed", scoreRaw: 0, scoreMax: 0 }, // malformed — skip
        l2: { status: "passed", scoreRaw: 8, scoreMax: 10 }, // 80%
      },
    });
    assert.equal(result.finalScorePct, 80);
    assert.equal(result.scoredLessonCount, 1);
    assert.equal(result.shouldFlipToPassed, true);
  });
});
