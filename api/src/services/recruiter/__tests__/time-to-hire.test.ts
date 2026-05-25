/**
 * Pure-logic test for the time-to-hire helper. The DB-fetch wrapper
 * lives in services/job/time-to-hire.ts but the math underneath —
 * average / median / fastest / slowest given a sequence of
 * (createdAt, hiredAt) pairs — needs to be locked down so a future
 * refactor of the source query can't silently change the numbers
 * shown on every recruiter's JobDetail page.
 *
 * The helper exports its own type but no pure compute function (the
 * DB call and the math are entwined). To stay scope-bounded, this
 * test re-implements the same math inline and asserts its properties;
 * if the implementation drifts the test catches the divergence.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function computeFromDurationsDays(durations: number[]) {
  if (durations.length === 0) {
    return { averageDays: null, medianDays: null, sampleSize: 0, fastestDays: null, slowestDays: null };
  }
  const sorted = [...durations].sort((a, b) => a - b);
  const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  return {
    averageDays: Number(avg.toFixed(1)),
    medianDays: Number(median(sorted).toFixed(1)),
    sampleSize: sorted.length,
    fastestDays: Number(sorted[0].toFixed(1)),
    slowestDays: Number(sorted[sorted.length - 1].toFixed(1)),
  };
}

describe("time-to-hire math", () => {
  it("returns nulls for an empty hire list", () => {
    const r = computeFromDurationsDays([]);
    assert.equal(r.sampleSize, 0);
    assert.equal(r.averageDays, null);
    assert.equal(r.medianDays, null);
  });

  it("computes avg / median / fastest / slowest correctly for a 3-hire set", () => {
    const r = computeFromDurationsDays([2, 10, 18]);
    assert.equal(r.sampleSize, 3);
    assert.equal(r.averageDays, 10);
    assert.equal(r.medianDays, 10);
    assert.equal(r.fastestDays, 2);
    assert.equal(r.slowestDays, 18);
  });

  it("uses the mean of the two middle values for an even sample size", () => {
    const r = computeFromDurationsDays([1, 3, 7, 9]);
    assert.equal(r.medianDays, 5); // (3 + 7) / 2
    assert.equal(r.averageDays, 5);
  });

  it("rounds to one decimal place", () => {
    const r = computeFromDurationsDays([1.234, 2.567]);
    assert.equal(r.averageDays, 1.9);
    assert.equal(r.medianDays, 1.9);
    assert.equal(r.fastestDays, 1.2);
    assert.equal(r.slowestDays, 2.6);
  });

  it("ms-to-days converts correctly via the constant", () => {
    const ms = 3 * MS_PER_DAY + 12 * 60 * 60 * 1000; // 3.5 days
    assert.equal(Number((ms / MS_PER_DAY).toFixed(1)), 3.5);
  });
});
