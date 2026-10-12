/**
 * Unit coverage for the Career 360 inner-ring outcome math (gap #421).
 *
 * `computeOutcomes` is the pure mapping from a `saved_jobs` funnel
 * aggregate + the active-target gaps onto the four inner-ring signals
 * (Callbacks / Interviews / Offers / Goal Fit). The DB read that feeds
 * `FunnelCounts` is exercised separately; here we pin the parts that are
 * easy to silently break: the sample-size floors (so a couple of
 * applications can't paint the ring), the good/moderate/poor band
 * cut-offs, and the goal-fit severity inversion.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeOutcomes,
  type FunnelCounts,
} from "../Career360Service.js";
import {
  OUTCOME_SEGMENT_IDS,
  type CareerTargetDoc,
  type Gap,
  type OutcomeSegmentId,
  type OutcomeSignal,
} from "../../../../../shared/career360-types.js";

/** Build a FunnelCounts with zero defaults so each test states only the
 *  fields it exercises. */
function fc(partial: Partial<FunnelCounts>): FunnelCounts {
  return {
    applied: 0,
    interviewed: 0,
    offered: 0,
    practiceAvg: null,
    practiceCount: 0,
    ...partial,
  };
}

const NO_FUNNEL: FunnelCounts = fc({});

function signal(outcomes: OutcomeSignal[], id: OutcomeSegmentId): OutcomeSignal {
  const found = outcomes.find((o) => o.id === id);
  assert.ok(found, `missing outcome ${id}`);
  return found;
}

/** Minimal active-target doc carrying just the gaps goal-fit reads. */
function docWithGaps(severities: Gap["severity"][]): CareerTargetDoc {
  const gaps: Gap[] = severities.map((severity, i) => ({
    id: `gap_${i}`,
    category: "skills",
    severity,
    label: `gap ${i}`,
    currentValue: "x",
    targetValue: "y",
    suggestedActions: ["do z"],
  }));
  return {
    selected: {
      id: "t1",
      title: "Staff Engineer",
      description: "d",
      why: "w",
      timelineMonths: 12,
      chosenAt: "2026-01-01T00:00:00.000Z",
      rubric: { mustHaveSkills: [], niceToHaveSkills: [], expectedCertifications: [] },
      gaps,
      roadmap: [],
      lastRefreshedAt: "2026-01-01T00:00:00.000Z",
      resolvedItems: [],
    },
  };
}

describe("computeOutcomes — shape + ordering", () => {
  it("always returns the four segments in blueprint order", () => {
    const out = computeOutcomes(NO_FUNNEL, null);
    assert.deepEqual(
      out.map((o) => o.id),
      [...OUTCOME_SEGMENT_IDS],
    );
  });

  it("reports 'unknown' for every signal when there is no data at all", () => {
    const out = computeOutcomes(NO_FUNNEL, null);
    for (const o of out) {
      assert.equal(o.health, "unknown", `${o.id} should be unknown`);
      assert.equal(o.rate, null);
    }
  });
});

describe("computeOutcomes — sample-size floors", () => {
  it("keeps callbacks/offers 'unknown' below the 3-application floor", () => {
    // 2 applied, both reached interview — a perfect ratio, but too few to trust.
    const out = computeOutcomes(fc({ applied: 2, interviewed: 2, offered: 1 }), null);
    assert.equal(signal(out, "callback-rate").health, "unknown");
    assert.equal(signal(out, "offer-rate").health, "unknown");
    assert.equal(signal(out, "callback-rate").sampleSize, 2);
  });

  it("keeps interview-conversion 'unknown' below the 2-interview floor with no practice", () => {
    const out = computeOutcomes(fc({ applied: 10, interviewed: 1, offered: 1 }), null);
    assert.equal(signal(out, "interview-conversion").health, "unknown");
  });
});

describe("computeOutcomes — interview-practice readiness fallback (#2093)", () => {
  it("falls back to practice readiness when the real interview funnel is thin", () => {
    // No interviews yet, but a strong practice average → not grey.
    const out = signal(
      computeOutcomes(fc({ interviewed: 1, practiceAvg: 80, practiceCount: 3 }), null),
      "interview-conversion",
    );
    assert.equal(out.health, "good");
    assert.equal(out.rate, null, "practice readiness is a proxy, not a measured rate");
    assert.equal(out.sampleSize, 3);
  });

  it("prefers the real funnel over practice once there are enough interviews", () => {
    // 2 interviews → real ratio 0/2 = poor, even with great practice scores.
    const out = signal(
      computeOutcomes(fc({ interviewed: 2, offered: 0, practiceAvg: 95, practiceCount: 5 }), null),
      "interview-conversion",
    );
    assert.equal(out.health, "poor");
    assert.equal(out.sampleSize, 2);
  });

  it("bands a mediocre practice average as moderate", () => {
    const out = signal(
      computeOutcomes(fc({ practiceAvg: 60, practiceCount: 1 }), null),
      "interview-conversion",
    );
    assert.equal(out.health, "moderate");
  });
});

describe("computeOutcomes — funnel banding", () => {
  it("bands callback rate good/moderate/poor at the documented cut-offs", () => {
    // good: 4/10 = 0.40 ≥ 0.30
    assert.equal(
      signal(computeOutcomes(fc({ applied: 10, interviewed: 4, offered: 0 }), null), "callback-rate")
        .health,
      "good",
    );
    // moderate: 2/10 = 0.20, between 0.12 and 0.30
    assert.equal(
      signal(computeOutcomes(fc({ applied: 10, interviewed: 2, offered: 0 }), null), "callback-rate")
        .health,
      "moderate",
    );
    // poor: 1/20 = 0.05 < 0.12
    assert.equal(
      signal(computeOutcomes(fc({ applied: 20, interviewed: 1, offered: 0 }), null), "callback-rate")
        .health,
      "poor",
    );
  });

  it("computes the offer rate over applications, not interviews", () => {
    // 2 offers / 20 applied = 0.10 (moderate band: ≥0.04, <0.12)
    const offer = signal(
      computeOutcomes(fc({ applied: 20, interviewed: 5, offered: 2 }), null),
      "offer-rate",
    );
    assert.equal(offer.sampleSize, 20);
    assert.ok(Math.abs((offer.rate ?? 0) - 0.1) < 1e-9);
    assert.equal(offer.health, "moderate");
  });
});

describe("computeOutcomes — goal fit", () => {
  it("is 'unknown' with no active target", () => {
    assert.equal(signal(computeOutcomes(NO_FUNNEL, null), "goal-fit").health, "unknown");
  });

  it("scores all-low-severity gaps as 'good' (fit ≈ 1)", () => {
    const out = signal(computeOutcomes(NO_FUNNEL, docWithGaps(["low", "low"])), "goal-fit");
    assert.equal(out.health, "good");
    assert.equal(out.rate, 1);
    assert.equal(out.sampleSize, 2);
  });

  it("scores all-high-severity gaps as 'poor' (fit = 0)", () => {
    const out = signal(computeOutcomes(NO_FUNNEL, docWithGaps(["high", "high"])), "goal-fit");
    assert.equal(out.health, "poor");
    assert.equal(out.rate, 0);
  });

  it("scores a mixed bag in the moderate band", () => {
    // mean severity = (2 + 1 + 0)/3 = 1 → fit = 0.5 → moderate (≥0.34, <0.7)
    const out = signal(
      computeOutcomes(NO_FUNNEL, docWithGaps(["high", "medium", "low"])),
      "goal-fit",
    );
    assert.ok(Math.abs((out.rate ?? 0) - 0.5) < 1e-9);
    assert.equal(out.health, "moderate");
  });

  it("excludes resolved gaps — resolving both high gaps lifts fit to 'good'", () => {
    // Two high gaps would score 'poor'; marking both resolved leaves no
    // open gap, so goal-fit reads 'unknown' (nothing left to measure).
    const doc = docWithGaps(["high", "high"]);
    doc.selected!.resolvedItems = [
      { itemId: "gap_0", kind: "gap", resolvedAt: "2026-01-02T00:00:00.000Z" },
      { itemId: "gap_1", kind: "gap", resolvedAt: "2026-01-02T00:00:00.000Z" },
    ];
    const out = signal(computeOutcomes(NO_FUNNEL, doc), "goal-fit");
    assert.equal(out.health, "unknown");
    assert.equal(out.sampleSize, 0);
  });

  it("resolving one of two high gaps still leaves the open one 'poor'", () => {
    const doc = docWithGaps(["high", "high"]);
    doc.selected!.resolvedItems = [
      { itemId: "gap_0", kind: "gap", resolvedAt: "2026-01-02T00:00:00.000Z" },
    ];
    const out = signal(computeOutcomes(NO_FUNNEL, doc), "goal-fit");
    assert.equal(out.health, "poor");
    assert.equal(out.sampleSize, 1);
  });
});
